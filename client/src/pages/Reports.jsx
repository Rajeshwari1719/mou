import { useEffect, useMemo, useState } from 'react';
import Button from '../components/Button';
import { reportService } from '../services/reportService';
import { mouService } from '../services/mouService';
import { projectService } from '../services/projectService';

const dayDiff = (dateString) => {
  if (!dateString) return null;
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const buildNotifications = (mous, projects) => {
  const items = [];

  mous.forEach((mou) => {
    const collegeName = mou.college_name || 'MOU';
    const startedIn = dayDiff(mou.mou_date);
    const expiresIn = dayDiff(mou.valid_upto);

    if (startedIn !== null && startedIn <= 7 && startedIn >= 0) {
      items.push({ title: 'MOU Started', detail: `${collegeName} started ${startedIn === 0 ? 'today' : `${startedIn} day(s) ago`}.` });
    }

    if (expiresIn !== null) {
      if (expiresIn <= 30 && expiresIn >= 0) {
        items.push({ title: 'MOU Deadline Near', detail: `${collegeName} expires in ${expiresIn} day(s).` });
      } else if (expiresIn < 0) {
        items.push({ title: 'MOU Expired', detail: `${collegeName} expired ${Math.abs(expiresIn)} day(s) ago.` });
      }
    }
  });

  projects.forEach((project) => {
    const title = project.title || 'Project';
    const startedIn = dayDiff(project.start_date);
    const endsIn = dayDiff(project.end_date);

    if (startedIn !== null && startedIn <= 7 && startedIn >= 0) {
      items.push({ title: 'Project Started', detail: `${title} started ${startedIn === 0 ? 'today' : `${startedIn} day(s) ago`}.` });
    }

    if (endsIn !== null) {
      if (endsIn <= 30 && endsIn >= 0) {
        items.push({ title: 'Project Deadline Near', detail: `${title} ends in ${endsIn} day(s).` });
      } else if (endsIn < 0) {
        items.push({ title: 'Project Deadline Passed', detail: `${title} ended ${Math.abs(endsIn)} day(s) ago.` });
      }
    }
  });

  return items.slice(0, 12);
};

const ReportsPage = () => {
  const [mous, setMous] = useState([]);
  const [projects, setProjects] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [reportRes, mouRes, projectRes] = await Promise.all([
          reportService.getReports(),
          mouService.getMous(),
          projectService.getProjects(),
        ]);
        setMetrics(reportRes);
        setMous(mouRes.mous || []);
        setProjects(projectRes.projects || []);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const notifications = useMemo(() => buildNotifications(mous, projects), [mous, projects]);

  const download = async () => {
    const blob = await reportService.exportReport('mous');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mou-report.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">Insights</p>
          <h1 className="text-3xl font-bold text-gray-900">Reports & Notifications</h1>
        </div>
        <Button onClick={download}>Download MOU Report</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['MOU Performance', metrics ? `${metrics.mouPerformance}%` : '...'],
          ['Project Coverage', metrics ? `${metrics.projectCoverage}%` : '...'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">{label}</p>
            <h2 className="mt-3 text-3xl font-bold text-gray-900">{value}</h2>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
        <div className="mt-4 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-500">Checking MOU and project dates...</p>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-gray-500">No active deadline or start notifications at the moment.</p>
          ) : (
            notifications.map((notification, index) => (
              <div key={`${notification.title}-${index}`} className="rounded-lg border border-gray-200 p-4">
                <p className="font-medium text-gray-900">{notification.title}</p>
                <p className="mt-1 text-sm text-gray-600">{notification.detail}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
