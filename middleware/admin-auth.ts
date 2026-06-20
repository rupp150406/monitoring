// middleware/admin-auth.ts
// Runs on every navigation to pages that declare: definePageMeta({ middleware: 'admin-auth' })
// Reads the 'qurban_admin_auth' cookie set by POST /api/admin-auth.
// The cookie is NOT httpOnly so useCookie() can read it client-side after hydration.
// The value 'granted' is not sensitive — the actual ADMIN_PASSWORD never leaves the server.

export default defineNuxtRouteMiddleware(() => {
  const authCookie = useCookie('qurban_admin_auth');

  if (authCookie.value !== 'granted') {
    return navigateTo('/admin-login');
  }
});