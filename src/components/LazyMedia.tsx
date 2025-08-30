import { useInView } from "react-intersection-observer";
import CardSpinner from "./CardSpinner";

interface Props {
  src: string;
  type: "image" | "video";
  className?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

export default function LazyMedia({
  src, type, className,
  autoPlay = false, loop = false, muted = false,
}: Props) {
  const { ref, inView } = useInView({ rootMargin: "200px", triggerOnce: true });

  return (
    <div ref={ref} className={className}>
      {inView ? (
        type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          <video
            src={src}
            className="w-full h-full object-cover"
            preload="none"
            playsInline
            muted={muted}
            autoPlay={autoPlay}
            loop={loop}
            controls={false}
          />
        )
      ) : (
        <CardSpinner />
      )}
    </div>
  );
}
