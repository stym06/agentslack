import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import { db } from '@/lib/db'
import { provisionUserWorkspace } from '@/lib/auth/provision'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null

        // For MVP: auto-create user on first login
        let user = await db.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) {
          user = await db.user.create({
            data: {
              email: credentials.email,
              name: credentials.email.split('@')[0],
            },
          })
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      },
    }),
    // Optional: OAuth providers (only enabled if env vars are set)
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    ...(process.env.GITHUB_ID
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user }) {
      if (user.id) {
        await provisionUserWorkspace(user.id)
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
}
