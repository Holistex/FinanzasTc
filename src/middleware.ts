import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRouteAllowed, UserSessionData } from "@/lib/auth/permissions";

const PUBLIC_PATHS = [
  "/login",
  "/favicon.ico",
  "/_next",
  "/api/auth",
  "/images",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Permitir rutas públicas y assets estáticos
  if (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/")) ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Leer cookie de sesión
  const sessionCookie = request.cookies.get("tensacon_session")?.value;

  if (!sessionCookie) {
    // Si no hay cookie y no está en /login, redirigir al login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. Decodificar sesión del usuario
  let userSession: UserSessionData | null = null;
  try {
    userSession = JSON.parse(decodeURIComponent(sessionCookie));
  } catch {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Redirecciones a /bienvenida
  if (pathname === "/" || pathname === "/dashboard") {
    return NextResponse.redirect(new URL("/bienvenida", request.url));
  }

  // Si ya está en /bienvenida, permitir siempre
  if (pathname === "/bienvenida") {
    return NextResponse.next();
  }

  // 5. Verificar autorización por módulo según matriz de permisos RBAC
  const allowed = isRouteAllowed(userSession, pathname);

  if (!allowed) {
    // Redirigir a bienvenida indicando intento no autorizado
    const deniedUrl = new URL("/bienvenida", request.url);
    deniedUrl.searchParams.set("error", "unauthorized");
    deniedUrl.searchParams.set("ruta", pathname);
    return NextResponse.redirect(deniedUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
