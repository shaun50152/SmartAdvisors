import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import {
  Calendar,
  BookOpen,
  Clock,
  GraduationCap,
} from 'lucide-react';

interface DegreePlanData {
  plan: { semester: number; label: string; courses: { code: string; name: string; creditHours: number }[]; totalHours: number }[];
  stats?: { totalHours: number; completedHours: number; totalCourses: number; completedCourses: number };
}

interface DashboardPageProps {
  userName: string;
  department: string;
  college: string;
  degreePlan?: DegreePlanData;
  onViewPlan: () => void;
  onEditPlan: () => void;
  onNewTranscript: () => void;
}

function buildStats(plan?: DegreePlanData) {
  if (!plan?.stats) return [];
  const s = plan.stats;
  const semLeft = plan.plan?.length || 0;
  const coursesPlanned = plan.plan?.reduce((n, sem) => n + sem.courses.length, 0) || 0;
  const hrsLeft = Math.max(0, s.totalHours - s.completedHours);
  const pct = s.totalHours > 0 ? Math.round((s.completedHours / s.totalHours) * 100) : 0;
  return [
    { id: 'semesters', label: 'SEMESTERS LEFT', value: String(semLeft), icon: Calendar, color: '#5b7cfa', glowColor: 'rgba(91,124,250,0.15)' },
    { id: 'courses', label: 'COURSES PLANNED', value: String(coursesPlanned), icon: BookOpen, color: '#ff6b35', glowColor: 'rgba(255,107,53,0.15)' },
    { id: 'credits', label: 'CREDIT HRS LEFT', value: String(hrsLeft), icon: Clock, color: '#8892b8', glowColor: 'rgba(136,146,184,0.15)' },
    { id: 'complete', label: 'DEGREE COMPLETE', value: `${pct}%`, icon: GraduationCap, color: '#22c55e', glowColor: 'rgba(34,197,94,0.15)' },
  ];
}

export default function DashboardPage({
  userName,
  department,
  college,
  degreePlan,
  onViewPlan,
  onEditPlan,
  onNewTranscript,
}: DashboardPageProps) {
  const firstName = userName.split(' ')[0];
  const STATS = buildStats(degreePlan);
  const pct = degreePlan?.stats ? Math.round((degreePlan.stats.completedHours / degreePlan.stats.totalHours) * 100) : 0;
  const nextSemester = degreePlan?.plan?.[0];
  const planSemesters = degreePlan?.plan || [];
  const headerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const profsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /* ── Count-up helper ── */
    function countUp(el: HTMLElement, target: number, duration: number, delay: number) {
      setTimeout(() => {
        let start = 0;
        const step = target / (duration / 16);
        const timer = setInterval(() => {
          start = Math.min(start + step, target);
          el.textContent = Math.floor(start) + (el.dataset.suffix || '');
          if (start >= target) clearInterval(timer);
        }, 16);
      }, delay);
    }

    /* ── GSAP page-load sequence ── */
    const sidebar = document.querySelector('.ds-sidebar');
    if (sidebar) {
      gsap.fromTo(sidebar,
        { x: -40, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out', delay: 0 });
    }

    const header = headerRef.current;
    if (header) {
      // Header text
      gsap.fromTo(header.querySelector('.ds-header-left')!,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', delay: 0.1 });
      // Degree Plan button
      gsap.fromTo(header.querySelector('.ds-header-cta')!,
        { scale: 0.95, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)', delay: 0.2 });
    }

    // Stat cards
    const statCards = cardsRef.current?.querySelectorAll('.ds-stat-card');
    if (statCards?.length) {
      gsap.fromTo(statCards,
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.08, delay: 0.3 });
    }

    // Count-up stat values
    const valueEls = cardsRef.current?.querySelectorAll('.ds-stat-value');
    if (valueEls) {
      const targets = [
        { val: 4, suffix: '', delay: 300 },
        { val: 31, suffix: '', delay: 380 },
        { val: 89, suffix: '', delay: 460 },
        { val: 85, suffix: '%', delay: 540 },
      ];
      valueEls.forEach((el, i) => {
        const t = targets[i];
        if (!t) return;
        const htmlEl = el as HTMLElement;
        htmlEl.dataset.suffix = t.suffix;
        htmlEl.textContent = '0' + t.suffix;
        countUp(htmlEl, t.val, 800, t.delay);
      });
    }

    // Two-column row cards
    const leftCard = rowRef.current?.querySelector('.ds-row-card-left');
    const rightCard = rowRef.current?.querySelector('.ds-row-card-right');
    if (leftCard) {
      gsap.fromTo(leftCard,
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', delay: 0.6 });
    }
    if (rightCard) {
      gsap.fromTo(rightCard,
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', delay: 0.7 });
    }

    // Progress bar fill + shimmer
    const barFill = rowRef.current?.querySelector('.ds-degree-bar-fill');
    if (barFill) {
      gsap.to(barFill, { width: `${pct}%`, duration: 1.2, ease: 'power2.out', delay: 0.9 });
      gsap.fromTo(barFill,
        { backgroundPosition: '0% center' },
        { backgroundPosition: '100% center', duration: 1.5, ease: 'power1.out', delay: 0.9 });
    }

    // Semester rows
    const semRows = rowRef.current?.querySelectorAll('.ds-semester-row');
    if (semRows?.length) {
      gsap.fromTo(semRows,
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.4, stagger: 0.06, ease: 'power3.out', delay: 1.0 });
    }

    // Professor section — IntersectionObserver + GSAP
    const profsEl = profsRef.current;
    if (profsEl) {
      const profCards = profsEl.querySelectorAll('.ds-prof-card');
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            gsap.fromTo(profCards,
              { y: 20, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: 'power3.out' });
            obs.disconnect();
          }
        },
        { threshold: 0.1 },
      );
      obs.observe(profsEl);
      return () => obs.disconnect();
    }
  }, []);

  return (
    <>
      {/* ── Header ── */}
      <div ref={headerRef} className="ds-header">
        <div className="ds-header-left">
          <h1 className="ds-header-title">
            Welcome back, {firstName}! 👋
          </h1>
          <p className="ds-header-subtitle">
            {department} · {college}
          </p>
        </div>
        <button className="ds-header-cta" onClick={onViewPlan}>
          View My Degree Plan →
        </button>
      </div>

      {/* ── Stat Cards ── */}
      <div ref={cardsRef} className="ds-stats-grid">
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.id}
              className={`ds-stat-card ds-stat-stagger-${i}`}
              data-glow={stat.glowColor}
            >
              <div
                className="ds-stat-accent"
                aria-hidden="true"
              >
                <span
                  className="ds-stat-accent-bar"
                  data-color={stat.color}
                />
              </div>
              <div className="ds-stat-label-row">
                <span className="ds-stat-label">{stat.label}</span>
                <Icon className="ds-stat-icon" color={stat.color} size={18} />
              </div>
              <span className="ds-stat-value">{stat.value}</span>

              {stat.id === 'complete' && (
                <div className="ds-progress-track">
                  <div className="ds-progress-fill" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Two-Column Row: Degree Progress + Up Next ── */}
      <div ref={rowRef} className="ds-two-col">
        {/* LEFT: Degree Progress */}
        <div className="ds-row-card-left ds-degree-card">
          <div className="ds-degree-header">
            <span className="ds-degree-title">Degree Progress</span>
            <span className="ds-degree-pct">{pct}%</span>
          </div>

          <div className="ds-degree-bar-track">
            <div className="ds-degree-bar-fill" />
          </div>

          <div className="ds-semester-list">
            {planSemesters.slice(0, 6).map((sem, i) => (
              <div key={sem.label} className={`ds-semester-row ds-sem-stagger-${i}`}>
                <div className="ds-semester-left">
                  {i === 0 ? (
                    <svg className="ds-spinner-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="8" stroke="#5b7cfa" strokeWidth="2" strokeDasharray="4 3" fill="none" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="9" stroke="#8892b8" strokeWidth="1.5" fill="none" />
                      <path d="M8 10h4m-2-2l2 2-2 2" stroke="#8892b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  <span className="ds-semester-name">{sem.label}</span>
                </div>
                <span className="ds-semester-status" data-color={i === 0 ? '#5b7cfa' : '#8892b8'}>
                  {i === 0 ? 'Up Next' : `${sem.courses.length} courses`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Up Next */}
        <div className="ds-row-card-right ds-upnext-card">
          <span className="ds-upnext-label">{nextSemester ? `UP NEXT — ${nextSemester.label.toUpperCase()}` : 'UP NEXT'}</span>

          <div className="ds-upnext-list">
            {(nextSemester?.courses || []).map((course) => (
              <div key={course.code} className="ds-upnext-row">
                <div className="ds-upnext-icon" data-bg="#5b7cfa">
                  <BookOpen size={14} color="#5b7cfa" />
                </div>
                <div className="ds-upnext-info">
                  <span className="ds-upnext-code">{course.code}</span>
                  <span className="ds-upnext-name">{course.name}</span>
                </div>
                <span className="ds-upnext-cr">{course.creditHours} cr</span>
              </div>
            ))}
            {!nextSemester && (
              <p style={{ color: 'var(--ds-muted)', fontSize: '0.875rem', padding: '12px 0' }}>
                No plan generated yet. View your plan to get started.
              </p>
            )}
          </div>

          <div className="ds-upnext-actions">
            <button className="ds-upnext-btn" onClick={onEditPlan}>✏ Edit Plan Settings</button>
            <button className="ds-upnext-btn" onClick={onNewTranscript}>📄 New Transcript</button>
          </div>
        </div>
      </div>

      {/* ── Professor Recommendations ── */}
      <div ref={profsRef} className="ds-profs-section">
        <div className="ds-profs-glow" aria-hidden="true" />
        <div className="ds-profs-header">
          <h2 className="ds-profs-title">Professor Recommendations</h2>
          <p className="ds-profs-subtitle">View your full plan to see top-rated professors for each course</p>
        </div>
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <button className="ds-upnext-btn" onClick={onViewPlan} style={{ fontSize: '0.95rem', padding: '12px 28px' }}>
            View My Degree Plan →
          </button>
        </div>
      </div>

      {/* ── Footer Strip ── */}
      <footer className="ds-footer">
        <div className="ds-footer-logo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ds-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <span>Smart Advisors</span>
        </div>
        <div className="ds-footer-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ds-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <span>Built for UTA Students</span>
        </div>
        <div className="ds-footer-links">
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="#" title="Coming soon">Privacy Policy</a>
        </div>
      </footer>
    </>
  );
}
