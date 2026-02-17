'use client';

import { useState, useEffect } from 'react';
import { PageShell } from '@/components/layout/PageShell';
import { Mail, Clock, ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

export default function SupportPage() {
  const user = useSelector((state: RootState) => state.auth.user);
  const [formData, setFormData] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        name: user.name ?? prev.name,
        email: user.email ?? prev.email,
      }));
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          subject: formData.subject || undefined,
          message: formData.message,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      setSubmitted(true);
      setFormData({ ...formData, subject: '', message: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          
          {/* Back Button - Only show if user is authenticated */}
          {user && (
            <Link 
              href="/research"
              className="inline-flex items-center text-slate-400 hover:text-white mb-8 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Research
            </Link>
          )}

          {/* Main Card */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-8 sm:p-12">
            
            {/* Icon & Title */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center w-20 h-20 rounded-full bg-blue-500/10 mx-auto mb-6">
                <Mail className="w-10 h-10 text-blue-400" />
              </div>
              <h1 className="text-4xl font-bold text-white mb-2">
                Need Help?
              </h1>
              <p className="text-slate-300">
                Fill out the form below and we'll get back to you as soon as possible.
              </p>
            </div>

            {/* Contact Form */}
            <form onSubmit={handleSubmit} className="space-y-5 text-left">
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="Your name"
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-slate-300 mb-2">
                  Subject
                </label>
                <select
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                >
                  <option value="">Select a topic</option>
                  <option value="Technical Issue">Technical Issue</option>
                  <option value="Billing & Subscription">Billing & Subscription</option>
                  <option value="Feature Request">Feature Request</option>
                  <option value="Account Help">Account Help</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={5}
                  placeholder="Describe your issue or question..."
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <Send className="w-5 h-5" />
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>

            {error && (
              <p className="mt-4 text-center text-sm text-red-400">
                {error}
              </p>
            )}

            {submitted && (
              <p className="mt-4 text-center text-sm text-emerald-400">
                Your message has been sent successfully. We&apos;ll get back to you within 24 hours.
              </p>
            )}

            {/* Support Email Display */}
            <div className="mt-8 pt-8 border-t border-slate-700 text-center">
              <p className="text-sm text-slate-400 mb-2">
                Or email us directly at:
              </p>
              <a 
                href="mailto:support@bloomengine.ai"
                className="text-blue-400 hover:text-blue-300 font-medium text-lg transition-colors"
              >
                support@bloomengine.ai
              </a>
            </div>

            {/* Response Time */}
            <div className="mt-6 flex items-center justify-center text-slate-400">
              <Clock className="w-4 h-4 mr-2" />
              <span className="text-sm">We typically respond within 24 hours</span>
            </div>
          </div>

          {/* Additional Help - Only show if user is authenticated */}
          {user && (
            <div className="mt-8 text-center">
              <p className="text-slate-400 text-sm mb-4">
                Looking for something else?
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link
                  href="/research"
                  className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 hover:border-slate-600 transition-all duration-200 text-sm"
                >
                  Research
                </Link>
                <Link
                  href="/subscription"
                  className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 hover:border-slate-600 transition-all duration-200 text-sm"
                >
                  Subscription
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
