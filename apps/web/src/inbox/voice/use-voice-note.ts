"use client";

// The microphone button's state (voice-recorder.ts): idle, recording with a running time, or stopped at the five-minute limit
// and waiting to be sent. Starting asks for the microphone, and a refusal is kept as the problem to say in words.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  browserVoiceDependencies,
  startVoiceRecording,
  VoiceError,
  type VoiceProblem,
  type VoiceRecording,
} from "./voice-recorder";

export type VoicePhase = "idle" | "starting" | "recording" | "limit";

export function useVoiceNote(onFile: (file: File) => void) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [problem, setProblem] = useState<VoiceProblem | null>(null);
  // The server renders no microphone; the browser says whether it has one.
  const available = useSyncExternalStore(
    () => () => undefined,
    () => browserVoiceDependencies() !== null,
    () => false,
  );
  const recording = useRef<VoiceRecording | null>(null);
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => {
      setElapsedMs(recording.current?.elapsedMs() ?? 0);
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [phase]);
  // Leaving the chat lets the microphone go.
  useEffect(
    () => () => {
      recording.current?.cancel();
    },
    [],
  );

  const start = async () => {
    const deps = browserVoiceDependencies();
    if (deps === null) {
      setProblem("unsupported");
      return;
    }
    setProblem(null);
    setPhase("starting");
    try {
      recording.current = await startVoiceRecording(deps, () => {
        setElapsedMs(recording.current?.elapsedMs() ?? 0);
        setPhase("limit");
      });
      setElapsedMs(0);
      setPhase("recording");
    } catch (error) {
      setProblem(error instanceof VoiceError ? error.problem : "denied");
      setPhase("idle");
    }
  };
  const cancel = () => {
    recording.current?.cancel();
    recording.current = null;
    setPhase("idle");
  };
  const finish = async () => {
    const current = recording.current;
    if (current === null) return;
    try {
      const file = await current.finish();
      recording.current = null;
      setPhase("idle");
      onFile(file);
    } catch (error) {
      recording.current = null;
      setProblem(error instanceof VoiceError ? error.problem : "empty");
      setPhase("idle");
    }
  };
  return { phase, elapsedMs, problem, available, start, cancel, finish };
}
