import os
import sqlite3
from .parse_transcript import extract_all_courses 

def get_department_courses(department):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.abspath(os.path.join(script_dir, '../../data/classes.db'))
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database file not found at {db_path}")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute(f'SELECT * FROM ClassesFor{department}')
    rows = cur.fetchall()
    columns = [desc[0] for desc in cur.description]
    courses = [dict(zip(columns, row)) for row in rows]
    conn.close()
    return courses

def normalize_code(course_code):
    return ' '.join(str(course_code).replace('\xa0', ' ').split()).strip()

def is_course_eligible(course, completed, course_map):
    course_id = normalize_code(course['Course_Num'])
    prereqs = course.get('Pre_Requisites', '').strip()
    if prereqs and prereqs.lower() != 'none':
        prereq_list = [normalize_code(p) for p in prereqs.split(',') if p.strip()]
        for p in prereq_list:
            if p not in completed:
                return False
    coreqs = course.get('Co_Requisites', '').strip()
    if coreqs and coreqs.lower() != 'none':
        coreq_list = [normalize_code(p) for p in coreqs.split(',') if p.strip()]
        for ccode in coreq_list:
            if ccode in completed:
                continue
            co_course = course_map.get(ccode)
            if not co_course:
                return False
            co_prereqs = co_course.get('Pre_Requisites', '').strip()
            if co_prereqs and co_prereqs.lower() != 'none':
                co_prereq_list = [normalize_code(p) for p in co_prereqs.split(',') if p.strip()]
                for p in co_prereq_list:
                    if p not in completed:
                        return False
    return True

def expand_completed_with_prereqs(normalized_completed, course_map):
    """
    Transitively expand the completed set: if you passed a course, you must have
    satisfied its prerequisites too (directly or transitively).

    Example: student has MATH 2425 (Calc II) on transcript.
      MATH 2425 requires MATH 1426 → add MATH 1426 as implied completed.
      MATH 1426 requires MATH 1402 → add MATH 1402 as implied completed.
      MATH 1402 requires MATH 1302 → add MATH 1302 as implied completed.
    Result: Pre-Calc and Algebra no longer appear as eligible recommendations.
    """
    expanded = set(normalized_completed)
    changed = True
    while changed:
        changed = False
        for code in list(expanded):
            course = course_map.get(code)
            if not course:
                continue
            prereqs = course.get('Pre_Requisites', '').strip()
            if prereqs and prereqs.lower() != 'none':
                for p in [normalize_code(x) for x in prereqs.split(',') if x.strip()]:
                    if p not in expanded:
                        expanded.add(p)
                        changed = True
    return expanded


def filter_eligible_courses_unique(all_courses, completed_courses):
    normalized_completed = set(normalize_code(c) for c in completed_courses)
    course_map = {normalize_code(c['Course_Num']): c for c in all_courses}

    # Expand completed set: infer all implied prerequisites from transcript courses
    normalized_completed = expand_completed_with_prereqs(normalized_completed, course_map)

    eligible = dict()
    for course in all_courses:
        c_id = normalize_code(course['Course_Num'])
        if c_id in normalized_completed or c_id in eligible:
            continue
        if is_course_eligible(course, normalized_completed, course_map):
            eligible[c_id] = course
            coreqs = course.get('Co_Requisites', '').strip()
            if coreqs and coreqs.lower() != 'none':
                coreq_list = [normalize_code(cc) for cc in coreqs.split(',') if cc.strip()]
                for ccode in coreq_list:
                    if ccode not in normalized_completed and ccode in course_map and ccode not in eligible:
                        co_course = course_map[ccode]
                        if is_course_eligible(co_course, normalized_completed, course_map):
                            eligible[ccode] = co_course

    # Either/or rules: ENGR 1101 and UNIV are alternatives — only need one
    completed_univ = any(c.startswith('UNIV') for c in normalized_completed)
    completed_engr1101 = 'ENGR 1101' in normalized_completed
    if completed_univ:
        eligible.pop('ENGR 1101', None)
    if completed_engr1101:
        for code in list(eligible):
            if code.startswith('UNIV'):
                eligible.pop(code, None)

    return eligible

def generate_degree_plan(all_courses, completed_courses, credits_per_semester, selected_next=None):
    """
    Generate a semester-by-semester degree plan.
    Uses greedy topological scheduling: each semester, pick eligible courses
    prioritized by unlock potential (how many other courses depend on this one),
    required-first, and fill up to credit hour target.

    Args:
        all_courses: list of course dicts from get_department_courses()
        completed_courses: list of completed course code strings
        credits_per_semester: target credit hours per semester (e.g. 15)
        selected_next: optional list of course codes the user picked for semester 1

    Returns:
        list of semester dicts: [{semester, label, courses: [{code, name, creditHours, requirement}], totalHours}]
    """
    course_map = {normalize_code(c['Course_Num']): c for c in all_courses}
    normalized_completed = set(normalize_code(c) for c in completed_courses)
    normalized_completed = expand_completed_with_prereqs(normalized_completed, course_map)

    # Apply ENGR 1101 / UNIV either-or rule
    completed_univ = any(c.startswith('UNIV') for c in normalized_completed)
    completed_engr1101 = 'ENGR 1101' in normalized_completed

    # Build remaining courses set (not yet completed)
    remaining = {}
    for course in all_courses:
        code = normalize_code(course['Course_Num'])
        # Skip placeholders like "CE 43XX"
        if 'X' in code.split()[-1] if len(code.split()) == 2 else False:
            continue
        if code not in normalized_completed:
            remaining[code] = course

    # Apply either-or: remove the alternative if one is completed
    if completed_univ:
        remaining.pop('ENGR 1101', None)
    if completed_engr1101:
        for code in list(remaining):
            if code.startswith('UNIV'):
                remaining.pop(code, None)

    # Build reverse dependency map: for each course, how many other courses need it as a prereq
    unlock_count = {}
    for code, course in remaining.items():
        prereqs = course.get('Pre_Requisites', '').strip()
        if prereqs and prereqs.lower() != 'none':
            for p in [normalize_code(x) for x in prereqs.split(',') if x.strip()]:
                unlock_count[p] = unlock_count.get(p, 0) + 1

    def get_credit_hours(course):
        hrs = course.get('Credit_Hours', 3)
        try:
            return int(hrs)
        except (ValueError, TypeError):
            return 3

    def get_coreqs(course):
        coreqs = course.get('Co_Requisites', '').strip()
        if not coreqs or coreqs.lower() == 'none':
            return []
        return [normalize_code(c) for c in coreqs.split(',') if c.strip()]

    planned_completed = set(normalized_completed)
    semesters = []
    semester_num = 0

    while remaining:
        semester_num += 1

        # Find all currently eligible courses from remaining
        eligible = []
        for code, course in remaining.items():
            if is_course_eligible(course, planned_completed, course_map):
                eligible.append(code)

        if not eligible:
            # Deadlock: remaining courses exist but none eligible (missing external prereqs)
            # Add them as a final "remaining" bucket
            leftover = []
            for code in list(remaining):
                c = remaining[code]
                leftover.append({
                    'code': code,
                    'name': c.get('Course_Name', ''),
                    'creditHours': get_credit_hours(c),
                    'requirement': c.get('Requirement', 'required'),
                })
            if leftover:
                semesters.append({
                    'semester': semester_num,
                    'label': 'Remaining (prerequisites not in degree plan)',
                    'courses': leftover,
                    'totalHours': sum(c['creditHours'] for c in leftover),
                })
            break

        # Semester 1: use user's picks if provided
        if semester_num == 1 and selected_next:
            normalized_picks = [normalize_code(c) for c in selected_next]
            semester_courses = [c for c in normalized_picks if c in eligible]
            # Also pull in corequisites of selected courses
            extra_coreqs = []
            for code in semester_courses:
                for coreq in get_coreqs(remaining.get(code, {})):
                    if coreq in remaining and coreq not in semester_courses and coreq not in extra_coreqs:
                        extra_coreqs.append(coreq)
            semester_courses.extend(extra_coreqs)
        else:
            # Sort eligible by: required first, then unlock potential (desc), then credit hours (desc)
            def sort_key(code):
                c = remaining[code]
                is_required = 1 if c.get('Requirement', '').lower() == 'required' else 0
                unlocks = unlock_count.get(code, 0)
                hrs = get_credit_hours(c)
                return (-is_required, -unlocks, -hrs)

            eligible.sort(key=sort_key)

            semester_courses = []
            semester_hours = 0

            for code in eligible:
                c = remaining[code]
                hrs = get_credit_hours(c)

                # Check if adding this course (+ its coreqs) fits
                coreqs = get_coreqs(c)
                coreq_hours = 0
                coreq_codes = []
                for coreq in coreqs:
                    if coreq in remaining and coreq not in semester_courses:
                        coreq_hours += get_credit_hours(remaining[coreq])
                        coreq_codes.append(coreq)

                total_add = hrs + coreq_hours
                if semester_hours + total_add <= credits_per_semester + 1:  # +1 for slight flexibility
                    semester_courses.append(code)
                    semester_courses.extend(coreq_codes)
                    semester_hours += total_add

                if semester_hours >= credits_per_semester:
                    break

            # If nothing was picked (all remaining too big), force at least one
            if not semester_courses and eligible:
                semester_courses.append(eligible[0])

        # Deduplicate while preserving order
        seen = set()
        unique_courses = []
        for code in semester_courses:
            if code not in seen and code in remaining:
                seen.add(code)
                unique_courses.append(code)
        semester_courses = unique_courses

        # Build semester output
        sem_label = 'Next Semester' if semester_num == 1 else f'Semester {semester_num}'
        course_list = []
        for code in semester_courses:
            c = remaining[code]
            course_list.append({
                'code': code,
                'name': c.get('Course_Name', ''),
                'creditHours': get_credit_hours(c),
                'requirement': c.get('Requirement', 'required'),
            })

        total_hrs = sum(c['creditHours'] for c in course_list)
        semesters.append({
            'semester': semester_num,
            'label': sem_label,
            'courses': course_list,
            'totalHours': total_hrs,
        })

        # Move these courses to planned_completed and remove from remaining
        for code in semester_courses:
            planned_completed.add(code)
            remaining.pop(code, None)

    return semesters


def get_professor_offerings_for_course(course_code):
    # Looks in all tables for offerings of the given course code (subject_id + course_number)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.abspath(os.path.join(script_dir, '../../data/grades.sqlite'))
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Grades DB file not found at {db_path}")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cur.fetchall() if not row[0].startswith('sqlite')] # skip any sqlite internal tables
    offerings = []
    parts = course_code.split()
    if len(parts) != 2:
        return []  # skip elective placeholders like "CE 43XX", "HIST 13XX", "LPC XXXX"
    subj, num = parts
    for tbl in tables:
        safe_tbl = f'"{tbl}"' if ('-' in tbl or ' ' in tbl) else tbl
        try:
            cur.execute(f'SELECT subject_id, course_number, course_title, year, semester, instructor1, instructor2, instructor3, instructor4, instructor5, course_gpa FROM {safe_tbl} WHERE subject_id=? AND course_number=?', (subj, num))
            for row in cur.fetchall():
                offerings.append({
                    'subject_id': row[0],
                    'course_number': row[1],
                    'course_title': row[2],
                    'year': row[3],
                    'semester': row[4],
                    'course_gpa': row[10],
                    'instructors': [iname for iname in row[5:10] if iname and str(iname).strip() and str(iname).strip().lower() != 'none']
                })
        except Exception:
            continue
    conn.close()
    return offerings

def print_prof_recs_for_course(course_code, course_name, completed):
    offerings = get_professor_offerings_for_course(course_code)
    seen = set()
    if not offerings:
        print("    No professor data available (was this course not offered recently?)")
        return
    print(f"    Professors (from recent terms):")
    for offer in offerings:
        for prof in offer['instructors']:
            if prof in seen:
                continue
            seen.add(prof)
            gpa = offer['course_gpa']
            year = offer['year']
            sem = offer['semester']
            sem_label = f"{year} {sem}" if year and sem else "n/a"
            print(f"        - {prof} | Recent GPA: {gpa} | Term: {sem_label}")

def run_local_demo():
    """Run this for local testing with sample_transcript.pdf"""
    dept = 'CE'
    all_courses = get_department_courses(dept)
    print(f"Loaded {len(all_courses)} course/professor offerings for {dept} department.")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pdf_path = os.path.abspath(os.path.join(script_dir, '../../data/sample_transcript.pdf'))
    
    if not os.path.exists(pdf_path):
        print(f"PDF transcript not found at: {pdf_path}")
        completed = []
    else:
        completed = extract_all_courses(pdf_path)
    
    print(f"Completed courses from transcript: {completed}")
    
    eligible = filter_eligible_courses_unique(all_courses, completed)
    print(f"Eligible courses (not yet taken, prereqs/coreqs satisfied): {len(eligible)})")
    
    for code, e in list(eligible.items()):
        print(f"{code}: {e['Course_Name']}")
        co_req = e.get('Co_Requisites', '').strip()
        if co_req and co_req.lower() != 'none':
            co_req_list = [normalize_code(c) for c in co_req.split(',') if c.strip()]
            remaining_coreqs = [c for c in co_req_list if c not in completed]
            if remaining_coreqs:
                print(f"    Co-requisite(s): {', '.join(remaining_coreqs)}")
        print_prof_recs_for_course(code, e['Course_Name'], completed)

if __name__ == "__main__":
    run_local_demo()

# Export functions for API use
__all__ = [
    'get_department_courses',
    'filter_eligible_courses_unique',
    'get_professor_offerings_for_course',
    'generate_degree_plan',
    'extract_all_courses',
    'normalize_code'
]

