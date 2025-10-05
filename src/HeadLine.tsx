export default function HeadLine() {
  return (
    <header
      className="relative w-full bg-neutral-900 text-white flex items-center justify-center overflow-hidden
                 pt-12"   // was py-10 md:py-16
      aria-label="Rizz The Grid heading"
    >
      {/* background effects kept the same */}
      <div className="relative z-10 text-center px-6">
        <h1 className="font-extrabold tracking-tight leading-none
                       text-[9vw] md:text-[6rem]   // slightly smaller
                       bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-emerald-300
                       bg-clip-text text-transparent
                       drop-shadow-[0_0_20px_rgba(34,211,238,0.25)]">
          <span className="mr-2 text-cyan-300/70">[</span>
          Rizz The Grid
          <span className="ml-2 text-emerald-300/70">]</span>
        </h1>

        <p className="mt-4 text-[11px] md:text-sm text-white/70 font-mono tracking-wider">
          real-time energy intelligence · interactive US map · 14-day optimization
        </p>
      </div>
    </header>
  );
}
