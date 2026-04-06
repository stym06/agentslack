'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      email,
      password: 'dummy', // For MVP, any password works
      redirect: false,
    })

    setLoading(false)

    if (result?.ok) {
      router.push('/dashboard')
    } else {
      setError('Sign in failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-96">
        <h1 className="text-2xl font-bold text-white mb-2">AgentSlack</h1>
        <p className="text-gray-400 mb-6 text-sm">
          Sign in with your email to get started
        </p>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 mb-4 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            required
          />
          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
