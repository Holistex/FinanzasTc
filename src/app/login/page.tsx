"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  User,
} from "lucide-react";
import { loginUserAction } from "@/actions/auth.actions";

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    // Sanitizar username removiendo cualquier símbolo @ previo
    const u = usuario.trim().replace(/^@+/, "");
    const p = contrasena.trim();

    if (!u || !p) {
      setErrorMsg("Por favor ingrese su usuario y contraseña.");
      return;
    }

    setCargando(true);

    try {
      const result = await loginUserAction(u, p);

      if (result.success) {
        router.push("/bienvenida");
        router.refresh();
        return;
      }

      setErrorMsg(
        result.error || "Credenciales incorrectas o usuario inactivo en el sistema."
      );
    } catch {
      setErrorMsg("Ocurrió un error al intentar iniciar sesión. Por favor reintente.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0b0f19] px-4 py-8 text-slate-100 selection:bg-[#E05A10] selection:text-white">
      {/* Resplandor Ambiental de Fondo */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[550px] w-[550px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#E05A10]/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-md">
        {/* Header del Login: Sistema Orbital + Logo Empresa X + Identidad Corporativa */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="flex flex-col items-center justify-center mb-6">
            {/* Contenedor del Átomo / Órbitas */}
            <div className="relative w-36 h-36 flex items-center justify-center">
              {/* Órbita 1 (Cian) */}
              <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-spin-slow transform rotate-12">
                <div className="w-3.5 h-3.5 bg-cyan-400 rounded-full shadow-[0_0_12px_#22d3ee] absolute -top-1.5 left-1/2 -translate-x-1/2" />
              </div>

              {/* Órbita 2 (Esmeralda) */}
              <div className="absolute inset-0 rounded-full border border-emerald-400/30 animate-spin-reverse transform -rotate-45">
                <div className="w-3.5 h-3.5 bg-emerald-400 rounded-full shadow-[0_0_12px_#34d399] absolute -bottom-1.5 left-1/2 -translate-x-1/2" />
              </div>

              {/* Órbita 3 (Azul) */}
              <div className="absolute inset-0 rounded-full border border-blue-500/30 animate-spin-pulse transform rotate-75">
                <div className="w-3.5 h-3.5 bg-blue-500 rounded-full shadow-[0_0_12px_#3b82f6] absolute top-1/2 -right-1.5 -translate-y-1/2" />
              </div>

              {/* Isotipo Central: Logo Empresa X */}
              <div className="relative z-10 w-20 h-20 rounded-2xl bg-slate-900/80 backdrop-blur-md p-2 flex items-center justify-center border border-white/10 shadow-[0_0_25px_rgba(34,211,238,0.25)]">
                <img
                  src="/logo_empresa_x.png"
                  alt="Logo Empresa"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Subtítulo de Marca */}
            <span className="text-[11px] font-bold tracking-[0.2em] text-cyan-400 uppercase mt-3">
              POWERED BY HOLISTEX
            </span>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white uppercase sm:text-3xl">
            Finanzas Tensacon
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-medium text-slate-400">
            Plataforma de Gestión Financiera, SII & Factoring
          </p>
        </div>

        {/* Tarjeta Formulario de Inicio de Sesión */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-white sm:text-xl">
              Iniciar Sesión
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Ingrese sus credenciales de acceso asignadas.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Campo USUARIO */}
            <div>
              <label
                htmlFor="usuario"
                className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wider"
              >
                Usuario
              </label>
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 text-slate-400">
                  <User className="h-4 w-4" />
                </span>
                <input
                  id="usuario"
                  name="usuario"
                  type="text"
                  required
                  autoComplete="username"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value.replace(/^@+/, ""))}
                  placeholder="Tu nombre de usuario es la inicial de tu nombre más tu apellido"
                  className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950/60 pl-10 pr-3 text-xs sm:text-sm text-white placeholder:text-slate-500 transition-all focus:border-[#E05A10] focus:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20"
                />
              </div>
            </div>

            {/* Campo CONTRASEÑA */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Contraseña
              </label>
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 text-slate-400">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type={mostrarPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950/60 pl-10 pr-10 text-sm text-white placeholder:text-slate-500 transition-all focus:border-[#E05A10] focus:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#E05A10]/20"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  className="absolute right-3 text-slate-400 hover:text-slate-200 transition-colors"
                  tabIndex={-1}
                >
                  {mostrarPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Botón de Acción */}
            <button
              type="submit"
              disabled={cargando}
              className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#E05A10] hover:bg-[#C2410C] text-white text-xs uppercase tracking-wider font-bold shadow-lg shadow-[#E05A10]/25 transition-all active:scale-[0.99] disabled:opacity-50"
            >
              <span>
                {cargando ? "Verificando credenciales..." : "Iniciar Sesión"}
              </span>
              {!cargando && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-7 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span>© 2026 Finanzas Tensacon. Todos los derechos reservados.</span>
        </p>
      </div>
    </div>
  );
}
