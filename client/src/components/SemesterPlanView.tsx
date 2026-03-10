import { ArrowLeft, Calendar, BookOpen, Sparkles, GraduationCap, Clock, Download } from 'lucide-react';
import { motion } from 'framer-motion';

interface PlannedCourse {
  code: string;
  name: string;
  creditHours: number;
  requirement: string;
}

interface Semester {
  semester: number;
  label: string;
  courses: PlannedCourse[];
  totalHours: number;
}

interface SemesterPlanViewProps {
  plan: {
    plan: Semester[];
    totalSemesters: number;
    totalRemainingHours: number;
    stats?: {
      totalCourses: number;
      totalHours: number;
      completedCourses: number;
      completedHours: number;
    };
  };
  onBack: () => void;
}

export default function SemesterPlanView({ plan, onBack }: SemesterPlanViewProps) {
  const semesters = plan.plan || [];
  const totalCoursesPlanned = semesters.reduce((sum, s) => sum + s.courses.length, 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-6xl mx-auto">

      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { background: white !important; color: black !important; }
          button, .no-print { display: none !important; }
          .max-w-6xl { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .semester-grid { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
          .semester-card { background: white !important; border: 2px solid #333 !important; border-radius: 8px !important; break-inside: avoid !important; }
          .semester-card * { color: black !important; background: transparent !important; }
          svg { width: 12px !important; height: 12px !important; stroke: black !important; }
        }
      `}</style>

      {/* Top controls */}
      <div className="flex justify-between items-center mb-6 no-print">
        <button onClick={onBack} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors font-bold">
          <ArrowLeft className="w-4 h-4" /> Back to Setup
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-[#0046FF] hover:bg-[#0036CC] text-white px-4 py-2 rounded-xl shadow-lg transition-all font-bold"
        >
          <Download className="w-4 h-4" /> Save as PDF
        </button>
      </div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <h2 className="text-4xl font-bold text-white mb-3 flex items-center justify-center gap-3">
          Your Degree Plan <GraduationCap className="w-8 h-8 text-[#FF8040]" />
        </h2>
        <p className="text-white/60 text-lg">
          <span className="text-[#FF8040] font-bold">{totalCoursesPlanned} courses</span> across{' '}
          <span className="text-white font-bold">{semesters.length} semesters</span> •{' '}
          <span className="text-white/80">{plan.totalRemainingHours} credit hours remaining</span>
        </p>
      </motion.div>

      {/* Stats bar */}
      {plan.stats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex flex-wrap items-center gap-3 mb-8 text-sm"
        >
          <span className="flex items-center gap-1.5 bg-[#0046FF]/10 border border-[#0046FF]/20 text-blue-300 font-semibold px-3 py-1.5 rounded-full">
            <BookOpen className="w-3.5 h-3.5" /> {plan.stats.completedCourses}/{plan.stats.totalCourses} completed
          </span>
          <span className="flex items-center gap-1.5 bg-white/5 border border-white/10 text-white/60 font-semibold px-3 py-1.5 rounded-full">
            <Clock className="w-3.5 h-3.5" /> {plan.stats.completedHours}/{plan.stats.totalHours} credit hours
          </span>
          <span className="flex items-center gap-1.5 bg-[#FF8040]/10 border border-[#FF8040]/20 text-orange-300 font-semibold px-3 py-1.5 rounded-full">
            <Calendar className="w-3.5 h-3.5" /> ~{semesters.length} semesters to go
          </span>
        </motion.div>
      )}

      {/* Semester cards grid */}
      <div className="grid md:grid-cols-2 gap-6 semester-grid">
        {semesters.map((semester, idx) => (
          <motion.div
            key={semester.semester}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="semester-card bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden"
          >
            {/* Semester header */}
            <div className={`px-5 py-4 border-b border-white/10 flex items-center justify-between ${
              idx === 0 ? 'bg-[#FF8040]/10' : 'bg-[#0046FF]/10'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${idx === 0 ? 'bg-[#FF8040]' : 'bg-[#0046FF]'}`}>
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">{semester.label}</h3>
                  <p className="text-white/40 text-xs">{semester.courses.length} courses</p>
                </div>
              </div>
              <span className={`text-sm font-bold px-3 py-1 rounded-full border ${
                idx === 0
                  ? 'text-[#FF8040] bg-[#FF8040]/20 border-[#FF8040]/30'
                  : 'text-[#0046FF] bg-[#0046FF]/20 border-[#0046FF]/30'
              }`}>
                {semester.totalHours} hrs
              </span>
            </div>

            {/* Course list */}
            <div className="p-4 space-y-2">
              {semester.courses.map((course) => (
                <div
                  key={course.code}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      course.requirement === 'elective' ? 'bg-[#FF8040]' : 'bg-[#0046FF]'
                    }`} />
                    <div className="min-w-0">
                      <span className="text-white font-semibold text-sm">{course.code}</span>
                      <p className="text-white/40 text-xs truncate">{course.name}</p>
                    </div>
                  </div>
                  <span className="text-white/30 text-xs font-semibold flex-shrink-0 ml-2">
                    {course.creditHours} hrs
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Footer note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-10 text-center no-print"
      >
        <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-5 py-3">
          <Sparkles className="w-4 h-4 text-[#FF8040]" />
          <p className="text-white/40 text-sm">
            This plan respects prerequisite chains and distributes courses by priority.
            Always verify with your academic advisor.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
