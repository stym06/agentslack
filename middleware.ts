import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/login',
  },
})

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/messages/:path*',
    '/api/agents/:path*',
    '/api/channels/:path*',
  ],
}
