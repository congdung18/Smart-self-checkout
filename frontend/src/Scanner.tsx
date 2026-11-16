import { useEffect, useRef, useState } from "react";
type Detector = {
  detect: (element: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};
export function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState(
    "Chỉ bật camera khi bạn sẵn sàng quét.",
  );
  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (timer.current) clearTimeout(timer.current);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
    };
  }, []);
  async function start() {
    const DetectorClass = (
      window as unknown as {
        BarcodeDetector?: new (options: { formats: string[] }) => Detector;
      }
    ).BarcodeDetector;
    if (!DetectorClass || !navigator.mediaDevices?.getUserMedia) {
      setMessage(
        "Trình duyệt chưa hỗ trợ quét. Hãy nhập mã sản phẩm ở bên dưới.",
      );
      return;
    }
    try {
      stop();
      const camera = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (!mounted.current) {
        camera.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = camera;
      if (!video.current) {
        stop();
        return;
      }
      video.current.srcObject = camera;
      await video.current.play();
      setRunning(true);
      setMessage(
        "Đưa mã vạch vào khung. Đọc xong bạn sẽ kiểm tra rồi bấm Thêm.",
      );
      const detector = new DetectorClass({
        formats: ["ean_13", "ean_8", "code_128", "qr_code"],
      });
      async function read() {
        if (!stream.current || !video.current || !mounted.current) return;
        try {
          const codes = await detector.detect(video.current);
          if (!mounted.current || !stream.current) return;
          if (codes[0]?.rawValue) {
            stop();
            setRunning(false);
            setMessage("Đã đọc mã. Kiểm tra sản phẩm trước khi thêm.");
            onCode(codes[0].rawValue);
            return;
          }
          timer.current = setTimeout(() => {
            void read();
          }, 250);
        } catch {
          stop();
          setRunning(false);
          setMessage("Không đọc được camera. Hãy nhập mã thủ công.");
        }
      }
      void read();
    } catch {
      stop();
      setRunning(false);
      setMessage(
        "Không truy cập được camera. Bạn có thể cấp quyền hoặc nhập mã thủ công.",
      );
    }
  }
  return (
    <section className="scanner" aria-label="Quét mã sản phẩm">
      <video
        ref={video}
        muted
        playsInline
        aria-label="Hình ảnh camera quét mã"
      />
      <div className="scan-guide" aria-hidden="true" />
      <p role="status">{message}</p>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          if (running) {
            stop();
            setRunning(false);
          } else void start();
        }}
      >
        {running ? "Dừng camera" : "Bật camera"}
      </button>
    </section>
  );
}
