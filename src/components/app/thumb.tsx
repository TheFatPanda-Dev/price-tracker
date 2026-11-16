/* eslint-disable @next/next/no-img-element -- shop images come from arbitrary hosts */
export function Thumb({ src, size = 40 }: { src: string | null; size?: number }) {
  return (
    <span className="block flex-none overflow-hidden rounded-[4px] bg-track" style={{ width: size, height: size }}>
      {src && (
        <img src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" className="size-full bg-white object-contain" />
      )}
    </span>
  );
}
