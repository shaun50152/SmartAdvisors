from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from werkzeug.datastructures import FileStorage # Import for type hinting
import os
import tempfile
import sys
import traceback
import json

from app.models import Professor

from .scripts.recommendation_engine import (
    get_department_courses,
    get_core_curriculum,
    get_degree_info,
    get_elective_budgets,
    filter_eligible_courses_unique,
    get_professor_offerings_for_course,
    generate_degree_plan,
    parse_prereq_string,
    normalize_code
)
from .scripts.parse_transcript import extract_all_courses

api_bp = Blueprint('api', __name__, url_prefix='/api')

# --- SCORING ALGORITHM ---
def calculate_match_score(professor_obj, user_prefs):
    """
    Score a professor against the student's preferences.

    Signals used:
      - quality_rating (0-5):  primary base score
      - would_take_again (%):  strong trust signal, boosts/damps base
      - total_ratings (count): confidence multiplier -- more reviews = more reliable
      - difficulty_rating:     used when clearGrading preference is set
      - tags:                  matched against actual RMP tag strings from DB
    """
    if not professor_obj:
        return 0.0

    # -- 1. BASE: quality rating --
    try:
        base_score = float(professor_obj.rating) if professor_obj.rating else 2.5
    except Exception:
        base_score = 2.5

    # -- 2. TRUST BOOST: would_take_again --
    try:
        wta_raw = str(professor_obj.would_take_again or "").strip().replace('%', '')
        wta = float(wta_raw) / 100.0 if wta_raw and wta_raw != 'N/A' else None
    except Exception:
        wta = None

    if wta is not None:
        if wta >= 0.85:
            base_score += 0.5
        elif wta >= 0.70:
            base_score += 0.25
        elif wta <= 0.35:
            base_score -= 0.5
        elif wta <= 0.50:
            base_score -= 0.25

    # -- 3. CONFIDENCE WEIGHT based on review count --
    try:
        total = int(professor_obj.total_ratings) if professor_obj.total_ratings else 0
    except Exception:
        total = 0

    if total == 0:
        base_score = 0.5 * base_score + 0.5 * 2.5
    elif total < 5:
        base_score = 0.75 * base_score + 0.25 * 2.5
    elif total < 15:
        base_score = 0.88 * base_score + 0.12 * 2.5

    score = base_score

    # -- 4. DIFFICULTY --
    try:
        difficulty = float(professor_obj.difficulty) if professor_obj.difficulty else 3.0
    except Exception:
        difficulty = 3.0

    # -- 5. TAGS (lowercased) --
    try:
        tags = str(professor_obj.tags).lower() if professor_obj.tags else ""
    except Exception:
        tags = ""

    bonus = 0.0

    # A. EXTRA CREDIT
    if user_prefs.get('extraCredit'):
        if 'extra credit' in tags:
            bonus += 1.0

    # B. CLEAR / EASY GRADING
    if user_prefs.get('clearGrading'):
        bonus += (5.0 - difficulty) * 0.4
        if 'clear grading criteria' in tags:
            bonus += 1.0
        if 'graded by few things' in tags:
            bonus += 0.8
        if 'tests? not many' in tags:
            bonus += 0.5
        if 'tough grader' in tags:
            bonus -= 1.5

    # C. GOOD FEEDBACK
    if user_prefs.get('goodFeedback'):
        if 'gives good feedback' in tags:
            bonus += 1.5
        if 'inspirational' in tags:
            bonus += 0.5

    # D. CARING / ACCESSIBLE
    if user_prefs.get('caring'):
        if 'caring' in tags:
            bonus += 1.2
        if 'accessible outside class' in tags:
            bonus += 1.0
        if 'respected' in tags:
            bonus += 0.6
        if 'inspirational' in tags:
            bonus += 0.4

    # E. LECTURE QUALITY
    if user_prefs.get('lectureHeavy'):
        if 'amazing lectures' in tags:
            bonus += 1.5
        elif 'lecture heavy' in tags:
            bonus += 0.3

    # F. GROUP PROJECTS
    if user_prefs.get('groupProjects'):
        if 'group projects' in tags:
            bonus += 1.0

    # -- 6. DEAL-BREAKER PENALTIES --
    if user_prefs.get('avoidTestHeavy'):
        if 'test heavy' in tags or 'tests are tough' in tags:
            bonus -= 1.5

    if user_prefs.get('avoidHomeworkHeavy'):
        if 'lots of homework' in tags or 'so many papers' in tags:
            bonus -= 1.0
        if 'get ready to read' in tags:
            bonus -= 0.5

    if user_prefs.get('avoidStrictAttendance'):
        if "skip class? you won't pass." in tags:
            bonus -= 1.2
        if 'participation matters' in tags:
            bonus -= 0.5

    if user_prefs.get('avoidPopQuizzes'):
        if 'beware of pop quizzes' in tags:
            bonus -= 2.0

    # -- 7. FINAL SCORE --
    final = score + bonus
    return round(final, 1)


def _build_professors_for_course(code, user_prefs=None):
    """
    Look up top-3 professors for a course code.
    user_prefs defaults to {} so ranking falls back to pure quality/rating score.
    """
    if user_prefs is None:
        user_prefs = {}
    try:
        offerings = get_professor_offerings_for_course(code)
    except Exception:
        return []

    professors_list = []
    seen = set()

    for offer in offerings:
        for prof_name in offer.get('instructors', []):
            if not prof_name or prof_name.lower() in ['staff', 'tba', 'unknown']:
                continue
            if prof_name in seen:
                continue
            seen.add(prof_name)
            try:
                db_prof = Professor.query.filter(Professor.name.ilike(prof_name)).first()

                if not db_prof and ',' in prof_name:
                    parts = prof_name.split(',')
                    if len(parts) >= 2:
                        swapped = f"{parts[1].strip()} {parts[0].strip()}"
                        db_prof = Professor.query.filter(Professor.name.ilike(swapped)).first()

                if not db_prof:
                    parts = prof_name.replace(',', '').split()
                    if parts:
                        last_name = parts[0] if ',' in prof_name else parts[-1]
                        db_prof = Professor.query.filter(Professor.name.ilike(f"%{last_name}%")).first()

                match_score = calculate_match_score(db_prof, user_prefs)

                final_rating = 0.0
                if db_prof and db_prof.rating is not None:
                    try: final_rating = float(db_prof.rating)
                    except: pass
                else:
                    try: final_rating = round(float(offer.get('course_gpa', 0) or 0), 1)
                    except: pass

                final_difficulty = "Moderate"
                if db_prof and db_prof.difficulty:
                    try:
                        diff_val = float(db_prof.difficulty)
                        if diff_val < 2.5: final_difficulty = "Easy"
                        elif diff_val > 3.8: final_difficulty = "Hard"
                    except: pass

                final_wta = None
                if db_prof and db_prof.would_take_again:
                    wta_str = str(db_prof.would_take_again).strip()
                    try:
                        wta_num = float(wta_str.replace('%', ''))
                        if wta_str not in ('N/A', '0%') and wta_num > 0:
                            final_wta = wta_str
                    except: pass

                final_tags = []
                if db_prof and db_prof.tags:
                    final_tags = [t.strip() for t in str(db_prof.tags).split(',')[:3] if t.strip()]

                final_review_count = 0
                if db_prof and db_prof.total_ratings:
                    try: final_review_count = int(db_prof.total_ratings)
                    except: pass

                professors_list.append({
                    'name': prof_name,
                    'rating': final_rating,
                    'difficulty': final_difficulty,
                    'matchScore': match_score,
                    'wouldTakeAgain': final_wta,
                    'tags': final_tags,
                    'reviewCount': final_review_count,
                })
            except Exception:
                continue

    professors_list.sort(key=lambda x: x['matchScore'], reverse=True)
    return professors_list[:3]


@api_bp.route('/parse-transcript', methods=['POST'])
def parse_transcript():
    print("\n=== PARSE TRANSCRIPT ROUTE CALLED ===", file=sys.stderr)
    try:
        if 'transcript' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file: FileStorage = request.files['transcript']

        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        temp_dir = tempfile.gettempdir()
        fname = secure_filename(file.filename or "temp.pdf")
        temp_path = os.path.join(temp_dir, fname)
        file.save(temp_path)

        courses = extract_all_courses(temp_path)

        if os.path.exists(temp_path):
            os.remove(temp_path)

        return jsonify({'success': True, 'courses': courses}), 200

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@api_bp.route('/recommendations', methods=['POST'])
def get_recommendations():
    print("\n=== RECOMMENDATIONS ROUTE CALLED ===", file=sys.stderr)

    try:
        department = request.form.get('department')
        if not department:
            return jsonify({'error': 'Department required'}), 400

        # 1. GET COMPLETED COURSES
        completed_courses = []
        raw_courses = request.form.get('completed_courses', '[]')
        try:
            if raw_courses and raw_courses != 'undefined':
                completed_courses = json.loads(raw_courses)
        except:
            print("Error parsing completed_courses JSON", file=sys.stderr)

        # Fallback: Parse file if list is missing
        if not completed_courses and 'transcript' in request.files:
            file: FileStorage = request.files['transcript']
            if file and file.filename:
                temp_dir = tempfile.gettempdir()
                fname = secure_filename(file.filename)
                temp_path = os.path.join(temp_dir, fname)
                file.save(temp_path)
                completed_courses = extract_all_courses(temp_path)
                if os.path.exists(temp_path): os.remove(temp_path)

        # 2. GET PREFERENCES
        user_prefs = {}
        try:
            raw_prefs = request.form.get('preferences', '{}')
            user_prefs = json.loads(raw_prefs)
        except:
            pass

        # 3. LOGIC ENGINE
        all_courses = get_department_courses(department)
        eligible = filter_eligible_courses_unique(all_courses, completed_courses)

        result = []
        for code, course in eligible.items():
            offerings = get_professor_offerings_for_course(code)

            professors_list = []
            seen = set()

            for offer in offerings:
                for prof_name in offer['instructors']:
                    if not prof_name or prof_name.lower() in ['staff', 'tba', 'unknown']:
                        continue

                    if prof_name not in seen:
                        seen.add(prof_name)

                        try:
                            db_prof = Professor.query.filter(Professor.name.ilike(prof_name)).first()

                            if not db_prof and ',' in prof_name:
                                parts = prof_name.split(',')
                                if len(parts) >= 2:
                                    swapped = f"{parts[1].strip()} {parts[0].strip()}"
                                    db_prof = Professor.query.filter(Professor.name.ilike(swapped)).first()

                            if not db_prof:
                                parts = prof_name.replace(',', '').split()
                                if len(parts) > 0:
                                    last_name = parts[0] if ',' in prof_name else parts[-1]
                                    db_prof = Professor.query.filter(Professor.name.ilike(f"%{last_name}%")).first()

                            match_score = calculate_match_score(db_prof, user_prefs)

                            final_rating = 0.0
                            if db_prof and db_prof.rating is not None:
                                try: final_rating = float(db_prof.rating)
                                except: final_rating = 0.0
                            else:
                                try: final_rating = round(float(offer.get('course_gpa', 0) or 0), 1)
                                except: final_rating = 0.0

                            final_tags = []
                            if db_prof and db_prof.tags:
                                final_tags = str(db_prof.tags).split(',')

                            final_difficulty = "Moderate"
                            if db_prof and db_prof.difficulty:
                                try:
                                    diff_val = float(db_prof.difficulty)
                                    if diff_val < 2.5: final_difficulty = "Easy"
                                    elif diff_val > 3.8: final_difficulty = "Hard"
                                except: pass

                            final_wta = None
                            if db_prof and db_prof.would_take_again:
                                wta_str = str(db_prof.would_take_again).strip()
                                try:
                                    wta_num = float(wta_str.replace('%', ''))
                                    if wta_str and wta_str not in ('N/A', '0%') and wta_num > 0:
                                        final_wta = wta_str
                                except Exception:
                                    pass

                            final_review_count = 0
                            if db_prof and db_prof.total_ratings:
                                try: final_review_count = int(db_prof.total_ratings)
                                except: pass

                            professors_list.append({
                                'id': str(len(professors_list)),
                                'name': prof_name,
                                'rating': final_rating,
                                'difficulty': final_difficulty,
                                'matchScore': match_score,
                                'wouldTakeAgain': final_wta,
                                'schedule': f"{offer.get('year','')} {offer.get('semester','')}".strip(),
                                'tags': final_tags,
                                'reviewCount': final_review_count,
                                'classSize': 'Unknown', 'assessmentType': 'Unknown', 'attendance': 'Unknown'
                            })
                        except Exception as inner_e:
                            print(f"Skipping prof {prof_name}: {inner_e}", file=sys.stderr)
                            continue

            # Sort by Match Score (Highest First)
            professors_list.sort(key=lambda x: x['matchScore'], reverse=True)

            coreqs = course.get('co_requisites', '') or ''
            entry = {
                'courseCode': code,
                'courseName': course['course_name'],
                'creditHours': course.get('credit_hours', 3),
                'corequisites': coreqs if coreqs and coreqs.lower() != 'none' else '',
                'professors': professors_list
            }
            # Tag with requirement type for partitioning
            entry['_requirement'] = course.get('requirement_type', 'required')
            result.append(entry)

        # Partition into required vs elective
        required = []
        electives = []
        for r in result:
            req_type = r.pop('_requirement', 'required')
            if req_type == 'elective':
                electives.append(r)
            else:
                required.append(r)

        # Calculate progress stats using new schema
        normalized_completed = set(normalize_code(c) for c in completed_courses)

        # Required courses
        required_courses = [c for c in all_courses if c.get('requirement_type', 'required') == 'required']
        total_required = len(required_courses)
        total_required_hours = sum(c.get('credit_hours', 3) for c in required_courses)
        completed_required = [c for c in required_courses if normalize_code(c['course_id']) in normalized_completed]
        completed_required_count = len(completed_required)
        completed_required_hours = sum(c.get('credit_hours', 3) for c in completed_required)

        # Elective budgets from degree_courses
        elective_budgets = get_elective_budgets(all_courses)
        total_elective_hours = sum(elective_budgets.values())
        total_elective_slots = len(elective_budgets)  # number of elective groups

        # Completed elective hours
        elective_courses = [c for c in all_courses if c.get('requirement_type') == 'elective']
        completed_elective_hours = sum(
            c.get('credit_hours', 3) for c in elective_courses
            if normalize_code(c['course_id']) in normalized_completed
        )
        completed_elective_count = sum(
            1 for c in elective_courses
            if normalize_code(c['course_id']) in normalized_completed
        )

        return jsonify({
            'success': True,
            'recommendations': required,
            'electiveRecommendations': electives,
            'stats': {
                'totalRequiredCourses': total_required,
                'totalRequiredHours': total_required_hours,
                'completedRequiredCourses': completed_required_count,
                'completedRequiredHours': completed_required_hours,
                'totalElectiveSlots': total_elective_slots,
                'totalElectiveHours': total_elective_hours,
                'completedElectives': completed_elective_count,
                'completedElectiveHours': completed_elective_hours,
                'remainingElectiveSlots': max(0, total_elective_slots - completed_elective_count),
                'electiveBudgets': elective_budgets,
            }
        }), 200

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        return jsonify({'error': str(e)}), 500


@api_bp.route('/degree-plan', methods=['POST'])
def degree_plan():
    """Generate a semester-by-semester degree plan."""
    try:
        data = request.get_json(force=True)
        department = data.get('department', 'CS')
        completed_courses = data.get('completed_courses', [])
        credits_per_semester = data.get('credits_per_semester', 15)
        selected_next = data.get('selected_next_semester', None)
        start_semester = data.get('start_semester', None)
        start_year = data.get('start_year', None)
        include_summer = bool(data.get('include_summer', False))
        user_preferences = data.get('preferences', {})
        chosen_electives = data.get('chosen_electives', None)

        if not department:
            return jsonify({'error': 'Department is required'}), 400

        all_courses = get_department_courses(department)
        semesters = generate_degree_plan(
            all_courses,
            completed_courses,
            credits_per_semester,
            selected_next,
            start_semester=start_semester,
            start_year=start_year,
            include_summer=include_summer,
            chosen_electives=chosen_electives,
        )

        # Enrich each course in the plan with top-3 professor data
        for semester in semesters:
            for course in semester.get('courses', []):
                try:
                    course['professors'] = _build_professors_for_course(course['code'], user_prefs=user_preferences)
                except Exception:
                    course['professors'] = []

        total_remaining_hours = sum(s['totalHours'] for s in semesters)

        # Eligible courses for the frontend course picker
        eligible = filter_eligible_courses_unique(all_courses, completed_courses)
        eligible_list = []
        for code, course in eligible.items():
            req_type = course.get('requirement_type', 'required')
            hrs = course.get('credit_hours', 3)
            try:
                hrs = int(hrs)
            except (ValueError, TypeError):
                hrs = 3
            eligible_list.append({
                'code': code,
                'name': course.get('course_name', ''),
                'creditHours': hrs,
                'requirement': req_type,
                'electiveGroup': course.get('elective_group'),
            })

        # Sort: required first, then by code
        eligible_list.sort(key=lambda x: (0 if x['requirement'] == 'required' else 1, x['code']))

        # Progress stats using new schema
        normalized_completed = set(normalize_code(c) for c in completed_courses)

        # Required courses
        required_courses_list = [c for c in all_courses if c.get('requirement_type', 'required').lower() == 'required']
        required_total = len(required_courses_list)
        required_hours = sum(c.get('credit_hours', 3) for c in required_courses_list)

        # Elective budgets
        elective_budgets = get_elective_budgets(all_courses)
        total_elective_hours = sum(elective_budgets.values())

        # Core curriculum
        core_curriculum = get_core_curriculum()
        total_core_hours = sum(cat['hours_required'] for cat in core_curriculum.values())

        # Total = required + elective budgets + core curriculum
        total_courses_approx = required_total + len(elective_budgets)
        total_hours = required_hours + total_elective_hours + total_core_hours

        # Degree total_hours from DB if available
        degree_info = get_degree_info(department)
        if degree_info and degree_info.get('total_hours'):
            total_hours = degree_info['total_hours']

        # Completed required
        completed_req_count = sum(1 for c in required_courses_list
            if normalize_code(c['course_id']) in normalized_completed)
        completed_req_hours = sum(c.get('credit_hours', 3) for c in required_courses_list
            if normalize_code(c['course_id']) in normalized_completed)

        # Completed electives by group
        elective_courses = [c for c in all_courses if c.get('requirement_type') == 'elective']
        completed_elective_hours_total = 0
        completed_elective_count = 0
        for c in elective_courses:
            if normalize_code(c['course_id']) in normalized_completed:
                completed_elective_hours_total += c.get('credit_hours', 3)
                completed_elective_count += 1

        # Completed core curriculum
        completed_core_hours = 0
        for cat_name, cat_info in core_curriculum.items():
            for cc_course in cat_info['courses']:
                if normalize_code(cc_course['course_id']) in normalized_completed:
                    completed_core_hours += cc_course.get('course_hours', 3)

        completed_count = completed_req_count + completed_elective_count
        completed_hours = completed_req_hours + completed_elective_hours_total + completed_core_hours

        # Build elective groups for frontend (grouped by elective_group)
        elective_groups = []
        elective_by_group = {}
        for c in all_courses:
            if c.get('requirement_type') != 'elective':
                continue
            group = c.get('elective_group', 'other')
            if group not in elective_by_group:
                elective_by_group[group] = {
                    'group': group,
                    'hoursRequired': c.get('elective_hours') or 0,
                    'courses': [],
                }
            code = normalize_code(c['course_id'])
            if code not in normalized_completed:
                hrs = c.get('credit_hours', 3)
                try:
                    hrs = int(hrs)
                except (ValueError, TypeError):
                    hrs = 3
                elective_by_group[group]['courses'].append({
                    'code': code,
                    'name': c.get('course_name', ''),
                    'creditHours': hrs,
                })
        elective_groups = sorted(elective_by_group.values(), key=lambda x: x['group'])

        # Required elective count: how many elective courses needed to fill all group budgets
        required_elective_count = 0
        for group_info in elective_groups:
            hrs_needed = group_info['hoursRequired']
            if hrs_needed > 0 and group_info['courses']:
                avg_hrs = sum(c['creditHours'] for c in group_info['courses']) / len(group_info['courses'])
                required_elective_count += max(1, round(hrs_needed / avg_hrs)) if avg_hrs > 0 else 1

        return jsonify({
            'success': True,
            'plan': semesters,
            'totalSemesters': len(semesters),
            'totalRemainingHours': total_remaining_hours,
            'eligibleCourses': eligible_list,
            'allElectives': [c for g in elective_groups for c in g['courses']],
            'electiveGroups': elective_groups,
            'requiredElectiveCount': required_elective_count,
            'stats': {
                'totalCourses': total_courses_approx,
                'totalHours': total_hours,
                'completedCourses': completed_count,
                'completedHours': completed_hours,
            }
        }), 200

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        return jsonify({'error': str(e)}), 500
