import { useNavigate, useParams } from 'react-router-dom';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { mouService } from '../services/mouService';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { formatDate } from '../utils/formatDate';

const MOUDetailsPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { hasRole } = useAuth();

  const [mou, setMou] = useState(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { mouService.getMou(id).then((r) => setMou(r.mou)); }, [id]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this MOU? Any linked projects and interns will also be deleted.')) return;

    setDeleting(true);
    try {
      await mouService.deleteMou(id);
      toast.success('MOU deleted');
      navigate('/mous', { replace: true });
    } catch (error) {
      toast.error(error.message || 'Could not delete the MOU.');
      setDeleting(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!mou) return;

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36;
    const innerX = margin;
    const innerY = margin;
    const innerW = pageWidth - margin * 2;

    // Draw outer border box
    doc.setLineWidth(1);
    doc.rect(innerX - 6, innerY - 6, innerW + 12, pageHeight - margin * 2 + 12);

    // Header area
    const headerHeight = 56;
    doc.setFillColor(250, 250, 250);
    doc.rect(innerX, innerY, innerW, headerHeight, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(mou.college_name || 'Partner', innerX + 12, innerY + 34);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const typeText = `[ ${mou.national_or_international || 'National'} ]`;
    const typeWidth = doc.getTextWidth(typeText);
    doc.text(typeText, innerX + innerW - 12 - typeWidth, innerY + 34);

    // Divider
    doc.setLineWidth(0.5);
    doc.line(innerX, innerY + headerHeight + 6, innerX + innerW, innerY + headerHeight + 6);

    // Title
    let y = innerY + headerHeight + 30;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Overview', innerX + 12, y);
    y += 18;

    // Two-column layout for fields
    const colGap = 24;
    const colWidth = (innerW - colGap) / 2 - 12;
    const leftX = innerX + 12;
    const rightX = innerX + 12 + colWidth + colGap;

    const leftFields = [
      { label: 'Partner', value: mou.college_name || '-' },
      { label: 'MOU Date', value: formatDate(mou.mou_date) },
      { label: 'Students Benefited', value: String(mou.students_benefited ?? 0) },
      { label: 'Objectives', value: mou.purpose || '-' },
      { label: 'Activities conducted so far', value: mou.activities || '-' },
    ];

    const rightFields = [
      { label: 'Department', value: mou.department_name || '-' },
      { label: 'Valid Until', value: formatDate(mou.valid_upto) },
      { label: 'Contact', value: mou.contact_name ? `${mou.contact_name} ${mou.contact_email ? `(${mou.contact_email})` : ''}` : '-' },
    ];

    // Render rows in parallel, aligning by rows where possible
    let li = 0;
    let ri = 0;
    let curYLeft = y;
    let curYRight = y;

    const renderFieldAt = (x, curY, field, width) => {
      const label = field.label;
      const value = String(field.value || '-');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(label, x, curY);
      curY += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const wrapped = doc.splitTextToSize(value, width);
      doc.text(wrapped, x, curY);
      curY += wrapped.length * 12 + 8;
      return curY;
    };

    // We will iterate until both lists are exhausted
    while (li < leftFields.length || ri < rightFields.length) {
      // Ensure page space for next block: compute anticipated heights
      const leftPreview = li < leftFields.length ? doc.splitTextToSize(String(leftFields[li].value || '-'), colWidth) : [];
      const leftHeight = (li < leftFields.length ? (14 + leftPreview.length * 12 + 8) : 0);
      const rightPreview = ri < rightFields.length ? doc.splitTextToSize(String(rightFields[ri].value || '-'), colWidth) : [];
      const rightHeight = (ri < rightFields.length ? (14 + rightPreview.length * 12 + 8) : 0);
      const blockHeight = Math.max(leftHeight, rightHeight);

      if (curYLeft + blockHeight > pageHeight - margin) {
        doc.addPage();
        // redraw border and header on new page
        doc.setLineWidth(1);
        doc.rect(innerX - 6, innerY - 6, innerW + 12, pageHeight - margin * 2 + 12);
        y = margin + 12;
        curYLeft = y;
        curYRight = y;
      }

      if (li < leftFields.length) {
        curYLeft = renderFieldAt(leftX, curYLeft, leftFields[li], colWidth);
        li++;
      }

      if (ri < rightFields.length) {
        curYRight = renderFieldAt(rightX, curYRight, rightFields[ri], colWidth);
        ri++;
      }

      // Synchronize Y position for next row to the greater of the two
      const newY = Math.max(curYLeft, curYRight);
      curYLeft = curYRight = newY;
    }

    doc.save(`mou-${mou.id || id}.pdf`);
  };

  if (!mou) return <p className="text-gray-500">Loading MOU details...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">MOU #{id}</p>
          <h1 className="text-3xl font-bold text-gray-900">{mou.college_name}</h1>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate('/mous')}>Back</Button>
          {hasRole('admin') ? <Button onClick={() => navigate(`/mous/${id}/edit`)}>Edit</Button> : null}
          {hasRole('admin') && <Button variant="danger" loading={deleting} onClick={handleDelete}>Delete</Button>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Overview</h2>
            <StatusBadge status={mou.national_or_international} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div><p className="text-sm text-gray-500">Partner</p><p className="font-medium">{mou.college_name}</p></div>
            <div><p className="text-sm text-gray-500">Department</p><p className="font-medium">{mou.department_name || '-'}</p></div>
            <div><p className="text-sm text-gray-500">MOU Date</p><p className="font-medium">{formatDate(mou.mou_date)}</p></div>
            <div><p className="text-sm text-gray-500">Valid Until</p><p className="font-medium">{formatDate(mou.valid_upto)}</p></div>
            <div><p className="text-sm text-gray-500">Students Benefited</p><p className="font-medium">{mou.students_benefited}</p></div>
            <div><p className="text-sm text-gray-500">Contact</p><p className="font-medium">{mou.contact_name || '-'} {mou.contact_email ? `(${mou.contact_email})` : ''}</p></div>
          </div>

          <div className="mt-6">
            <p className="text-sm text-gray-500">Objectives</p>
            <p className="mt-2 text-gray-700">{mou.purpose || '-'}</p>
            <p className="mt-4 text-sm text-gray-500">Activities conducted so far</p><p className="mt-2 text-gray-700">{mou.activities || '-'}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
          <div className="mt-4 space-y-3">
            <Button className="w-full" variant="secondary" onClick={handleDownloadPdf}>Download PDF</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MOUDetailsPage;
