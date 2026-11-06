import { useRef, useState } from "react";

/** Grava áudio do microfone e entrega um File .webm ao finalizar. */
export function useAudioRecorder(onComplete: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `gravacao-${Date.now()}.webm`, {
          type: "audio/webm",
        });
        onComplete(file);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  return { recording, toggleRecording };
}
