import Image from "next/image";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/projects" className={`group flex items-center ${compact ? "gap-2" : "gap-3"}`}>
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/10 ${
          compact ? "h-8 w-8 p-1" : "h-11 w-11 p-1.5"
        }`}
      >
        <Image
          src="/rbi-logo.png"
          alt="RBI"
          width={compact ? 24 : 32}
          height={compact ? 24 : 32}
          className="h-full w-full object-contain transition-transform group-hover:scale-105"
          priority
        />
      </span>
      <span className={compact ? "min-w-0 text-rbi-navy" : "min-w-0 text-white"}>
        <span className={`block font-bold tracking-[0.18em] ${compact ? "text-sm" : "text-base"}`}>RBI</span>
        {!compact ? <span className="mt-0.5 block text-2xs uppercase tracking-[0.12em] text-blue-100">Lembar kerja proyek</span> : null}
      </span>
    </Link>
  );
}
