import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import authService from '../../services/authService';
import Button from '../../components/Button';
import Input from '../../components/Input';

const passwordRequirements = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])\S{8,}$/;

const SignupPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name || !email || !form.password || !form.confirmPassword) return setError('All fields are required.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.');
    if (!passwordRequirements.test(form.password)) return setError('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.');

    setLoading(true);
    try {
      await authService.signup({ name, email, password: form.password, confirmPassword: form.confirmPassword });
      toast.success('Account created successfully. Please sign in.');
      navigate('/login', { replace: true, state: { email, message: 'Account created successfully. Please sign in.' } });
    } catch (requestError) {
      setError(requestError.message || 'Unable to create your account.');
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white">M</div>
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Full name" name="name" value={form.name} onChange={update} autoComplete="name" required />
          <Input label="Email" name="email" type="email" value={form.email} onChange={update} autoComplete="email" required />
          <Input label="Password" name="password" type="password" value={form.password} onChange={update} autoComplete="new-password" required />
          <p className="-mt-2 text-xs text-gray-500">Use 8+ characters with uppercase, lowercase, number, and special character.</p>
          <Input label="Confirm password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={update} autoComplete="new-password" required />
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">Create account</Button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-600">Already have an account? <Link to="/login" className="font-medium text-blue-600 hover:text-blue-700">Sign in</Link></p>
      </div>
    </div>
  );
};

export default SignupPage;
