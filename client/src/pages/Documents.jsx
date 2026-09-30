import { useEffect, useMemo, useState } from 'react';
import Button from '../components/Button';
import { documentService } from '../services/documentService';
import { mouService } from '../services/mouService';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../utils/formatDate';

const documentTypes = [
  'Signed MOU',
  'Annexure',
  'Renewal Letter',
  'Amendment',
  'Activity Report',
  'Internship Agreement',
  'Project Agreement',
  'Supporting Document',
  'Other',
];


const emptyForm = {
  mou_id: '',
  document_type: 'Signed MOU',
  document_name: '',
  description: '',
  version: '1.0',
  document_date: '',
  expiry_date: '',
  remarks: '',
  required: true,
};

const DocumentsPage = () => {
  const [documents, setDocuments] = useState([]);
  const [mous, setMous] = useState([]);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { user } = useAuth();

  const load = async () => {
    const [documentRes, mouRes] = await Promise.all([
      documentService.getDocuments(),
      mouService.getMous(),
    ]);
    setDocuments(documentRes.documents || []);
    setMous(mouRes.mous || []);
  };

  useEffect(() => {
    const timer = setTimeout(() => load().catch(() => {}), 0);
    return () => clearTimeout(timer);
  }, []);

  const stats = useMemo(() => {
    const total = documents.length;
    const expiring = documents.filter((doc) => doc.expiry_date).length;
    return { total, expiring };
  }, [documents]);

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const upload = async (event) => {
    event.preventDefault();

    if (!file || !form.mou_id) {
      setMessage('Select an MOU and choose a document file.');
      return;
    }

    const data = new FormData();
    data.append('file', file);
    data.append('mou_id', form.mou_id);
    data.append('document_type', form.document_type);
    data.append('document_name', form.document_name || file.name.replace(/\.[^.]+$/, ''));
    data.append('description', form.description || '');
    data.append('version', form.version || '1.0');
    data.append('document_date', form.document_date || '');
    data.append('expiry_date', form.expiry_date || '');
    data.append('required', String(form.required));
    data.append('remarks', form.remarks || '');

    try {
      setUploading(true);
      setMessage('');
      await documentService.uploadDocument(data);
      setMessage('Document uploaded successfully.');
      setFile(null);
      setForm(emptyForm);
      event.target.reset();
      await load();
    } catch (error) {
      setMessage(error.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const download = async (document) => {
    try {
      setDownloading(document.id);
      const blob = await documentService.downloadDocument(document.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.document_name || document.title || 'document';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error.message || 'Document download failed.');
    } finally {
      setDownloading(null);
    }
  };

  const remove = async (document) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      setDeleting(document.id);
      await documentService.deleteDocument(document.id);
      await load();
      setMessage('Document deleted successfully.');
    } catch (error) {
      setMessage(error.message || 'Document deletion failed.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">Repository</p>
        <h1 className="text-3xl font-bold text-gray-900">Document Vault</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Total Documents', stats.total],
          ['Expiring', stats.expiring],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">{label}</p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">{value}</h2>
          </div>
        ))}
      </div>

      {user?.role === 'admin' && <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Upload Document</h2>
        </div>

        <form onSubmit={upload} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-gray-700">
              MOU
              <select name="mou_id" value={form.mou_id} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none">
                <option value="">Select MOU</option>
                {mous.map((mou) => (
                  <option key={mou.id} value={mou.id}>{mou.college_name || 'MOU'} • {formatDate(mou.mou_date)}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700">
              Document Type
              <select name="document_type" value={form.document_type} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none">
                {documentTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700">
              Document Name
              <input type="text" name="document_name" value={form.document_name} onChange={handleInputChange} placeholder="ABC University Signed MOU" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none" />
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700">
              Version
              <input type="text" name="version" value={form.version} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none" />
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700">
              Document Date
              <input type="date" name="document_date" value={form.document_date} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none" />
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700">
              Expiry Date
              <input type="date" name="expiry_date" value={form.expiry_date} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none" />
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700 md:col-span-2">
              Description
              <textarea name="description" value={form.description} onChange={handleInputChange} rows="3" placeholder="Official signed agreement" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none" />
            </label>

            <div className="md:col-span-2 flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3">
              <div className="min-w-0 flex-1">
                {file ? (
                  <div className="inline-flex max-w-full items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                    <span className="truncate">{file.name}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-500">No file selected</span>
                )}
              </div>
              <label className="inline-flex cursor-pointer rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Choose File
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" name="required" checked={form.required} onChange={handleInputChange} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              Required document
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700 md:col-span-2">
              Remarks
              <textarea name="remarks" value={form.remarks} onChange={handleInputChange} rows="2" placeholder="Optional notes" className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none" />
            </label>
          </div>

          {message && <p className="text-sm text-blue-700">{message}</p>}

          <div className="flex justify-end">
            <Button type="submit" loading={uploading} disabled={!file || !form.mou_id}>Upload Document</Button>
          </div>
        </form>
      </div>}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">All Documents</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-3 font-medium">Document</th>
                <th className="px-4 py-3 font-medium">MOU</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Uploaded</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center text-gray-500">No documents uploaded yet.</td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id} className="border-t border-gray-200 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{doc.document_name || doc.title || 'Unnamed document'}</div>
                      <div className="text-xs text-gray-500">{doc.uploaded_by_name || 'Admin'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{doc.college_name || doc.mou_name || 'MOU'}</td>
                    <td className="px-4 py-3 text-gray-700">{doc.document_type || 'Other'}</td>
                    <td className="px-4 py-3 text-gray-700">{doc.version || '1.0'}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(doc.uploaded_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {doc.file_path && (
                          <button type="button" onClick={() => download(doc)} disabled={downloading === doc.id} className="rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{downloading === doc.id ? 'Downloading...' : 'Download'}</button>
                        )}
                        {user?.role === 'admin' && <button type="button" onClick={() => remove(doc)} disabled={deleting === doc.id} className="rounded bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">{deleting === doc.id ? 'Deleting...' : 'Delete'}</button>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DocumentsPage;
