"use client";

// The mic: tap to start, tap to stop (scope 3.6). The browser records in its own format (webm/opus in Chrome, mp4/aac in
// Safari), which the AI's endpoint does not read; so once it stops, the recording is decoded and written again as a 16 kHz
// mono WAV file (wav.ts). Stops by itself at two minutes, and the microphone is released as soon as it stops.
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RECORDING_SECONDS, wavOf } from "./wav";

export type RecorderProblem = "denied" | "unsupported" | "unreadable";

export function useRecorder(onRecorded: (wav: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<RecorderProblem | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDone = useRef(onRecorded);
  useEffect(() => {
    onDone.current = onRecorded;
  });

  const stop = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
    setRecording(false);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    setProblem(null);
    if (typeof navigator.mediaDevices.getUserMedia !== "function" || typeof MediaRecorder === "undefined") {
      setProblem("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setProblem("denied");
      return;
    }
    const pieces: Blob[] = [];
    const next = new MediaRecorder(stream);
    next.ondataavailable = (event) => {
      if (event.data.size > 0) pieces.push(event.data);
    };
    next.onstop = () => {
      // The microphone goes at once; the decoding takes its time.
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      setWorking(true);
      const context = new AudioContext();
      void new Blob(pieces, { type: next.mimeType })
        .arrayBuffer()
        .then((bytes) => context.decodeAudioData(bytes))
        .then((decoded) => {
          onDone.current(wavOf([decoded.getChannelData(0)], decoded.sampleRate));
        })
        .catch(() => {
          setProblem("unreadable");
        })
        .finally(() => {
          void context.close();
          setWorking(false);
        });
    };
    recorder.current = next;
    next.start();
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => {
      setSeconds((value) => {
        if (value + 1 >= MAX_RECORDING_SECONDS) setTimeout(stop, 0);
        return value + 1;
      });
    }, 1000);
  }, [stop]);

  // Leaving the dialog mid-recording lets the microphone go, and nothing is kept.
  useEffect(
    () => () => {
      if (timer.current !== null) clearInterval(timer.current);
      const open = recorder.current;
      if (open !== null) {
        open.onstop = null;
        if (open.state === "recording") open.stop();
        open.stream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    },
    [],
  );

  return { recording, working, seconds, problem, start, stop };
}
