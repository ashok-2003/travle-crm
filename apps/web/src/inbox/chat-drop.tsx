"use client";

// Drag a file onto the chat and it waits in the reply box (audit 5). The chat panel is the drop target; the reply box says what
// to do with a file by registering here, and a chat with no box (the window closed) ignores the drop.
import { UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

const DropContext = createContext<((take: ((file: File) => void) | null) => void) | null>(null);

/** The reply box's way to take a dropped file; call from the box while it is on screen. */
export function useDroppedFile(take: (file: File) => void): void {
  const register = useContext(DropContext);
  useEffect(() => {
    if (register === null) return;
    register(take);
    return () => {
      register(null);
    };
  }, [register, take]);
}

export function ChatDropZone({ children, className }: { children: ReactNode; className?: string }) {
  const t = useTranslations("inbox.chat.composer");
  const taker = useRef<((file: File) => void) | null>(null);
  const [over, setOver] = useState(false);
  const register = useCallback((take: ((file: File) => void) | null) => {
    taker.current = take;
  }, []);
  const carriesFile = (event: DragEvent) => event.dataTransfer.types.includes("Files");
  return (
    <DropContext.Provider value={register}>
      <div
        className={className}
        onDragOver={(event) => {
          if (!carriesFile(event) || taker.current === null) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={(event) => {
          setOver(false);
          const file = event.dataTransfer.files[0];
          if (file === undefined || taker.current === null) return;
          event.preventDefault();
          taker.current(file);
        }}
      >
        {children}
        {over && (
          <p className="pointer-events-none absolute inset-0 z-(--z-sticky) flex items-center justify-center gap-2 bg-scrim text-section font-semibold text-background">
            <UploadIcon aria-hidden="true" />
            {t("dropHere")}
          </p>
        )}
      </div>
    </DropContext.Provider>
  );
}
