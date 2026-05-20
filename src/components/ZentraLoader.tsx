"use client";

/**
 * Pantalla de carga premium con el logo ZENTRA.
 *
 * El logo se compone de dos cuadriláteros asimétricos (estilo "cursor"
 * con barra horizontal + muesca en un extremo + punta aguda en el otro)
 * que se cruzan superpuestos en el centro formando la Z. La animación
 * los separa suavemente — superior sube, inferior baja — y los vuelve
 * a juntar en loop.
 */
export default function ZentraLoader({
  label = "Cargando",
  fullscreen = true,
}: {
  label?: string;
  /** Si es true, ocupa min-h-screen. Si es false, se acomoda al contenedor. */
  fullscreen?: boolean;
}) {
  return (
    <div
      className={`flex w-full flex-col items-center justify-center gap-7 bg-slate-50 ${
        fullscreen ? "min-h-screen" : "min-h-[40vh] py-16"
      }`}
      aria-busy="true"
      role="status"
    >
      {/* Logo: dos cursores cuadriláteros cruzados */}
      <div className="relative h-24 w-24">
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full drop-shadow-[0_4px_18px_rgba(79,174,178,0.25)]"
          aria-hidden="true"
        >
          {/*
            Cursor superior — 5 vértices (sentido horario):
              · top-left  (10, 6)     ┐
              · top-right (94, 6)     │  barra superior horizontal
              · muesca    (75, 20)    ┘  pico hacia adentro debajo del corner derecho
              · centro    (55, 52)       donde se cruza con el inferior
              · left-tip  (4, 36)        punta aguda hacia la izquierda
          */}
          <path
            d="M 10 6 L 94 6 L 75 20 L 55 52 L 4 36 Z"
            fill="#4FAEB2"
            className="zentra-cursor-top origin-[50%_50%]"
          />

          {/*
            Cursor inferior — espejo punto-simétrico al centro (50,50):
              · bottom-right (90, 94)
              · bottom-left  (6, 94)
              · muesca       (25, 80)
              · centro       (45, 48)
              · right-tip    (96, 64)
          */}
          <path
            d="M 90 94 L 6 94 L 25 80 L 45 48 L 96 64 Z"
            fill="#3F8E91"
            className="zentra-cursor-bot origin-[50%_50%]"
          />
        </svg>

        {/* Halo turquesa suave detrás */}
        <span
          aria-hidden="true"
          className="zentra-loader-halo absolute inset-0 -z-10 rounded-full bg-[#4FAEB2]/8 blur-2xl"
        />
      </div>

      {/* Wordmark + indicador textual */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-slate-400">
          ZENTRA
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500">{label}</span>
          <span className="zentra-loader-dot inline-block h-1 w-1 rounded-full bg-[#4FAEB2]" />
          <span
            className="zentra-loader-dot inline-block h-1 w-1 rounded-full bg-[#4FAEB2]"
            style={{ animationDelay: "0.18s" }}
          />
          <span
            className="zentra-loader-dot inline-block h-1 w-1 rounded-full bg-[#4FAEB2]"
            style={{ animationDelay: "0.36s" }}
          />
        </div>
      </div>

      <style jsx>{`
        :global(.zentra-cursor-top) {
          animation: zentraCursorTop 2200ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        :global(.zentra-cursor-bot) {
          animation: zentraCursorBot 2200ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        :global(.zentra-loader-halo) {
          animation: zentraHalo 2200ms ease-in-out infinite;
        }
        .zentra-loader-dot {
          animation: zentraDot 1300ms ease-in-out infinite;
        }
        /* Cursor superior: sube ligeramente */
        @keyframes zentraCursorTop {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-7%);
          }
        }
        /* Cursor inferior: baja ligeramente */
        @keyframes zentraCursorBot {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(7%);
          }
        }
        @keyframes zentraHalo {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.85;
          }
          50% {
            transform: scale(1.25);
            opacity: 1;
          }
        }
        @keyframes zentraDot {
          0%,
          80%,
          100% {
            opacity: 0.25;
            transform: translateY(0);
          }
          40% {
            opacity: 1;
            transform: translateY(-2px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.zentra-cursor-top),
          :global(.zentra-cursor-bot),
          :global(.zentra-loader-halo),
          .zentra-loader-dot {
            animation: none;
          }
        }
      `}</style>

      <span className="sr-only">Cargando contenido…</span>
    </div>
  );
}
