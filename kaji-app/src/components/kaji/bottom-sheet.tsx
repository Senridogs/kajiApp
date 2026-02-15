"use client";

import { useEffect, useRef, type TouchEvent as ReactTouchEvent } from "react";
import { AnimatePresence, motion, type PanInfo, useDragControls } from "motion/react";
import { X } from "lucide-react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeightClassName?: string;
  containerClassName?: string;
  scrollable?: boolean;
};

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeightClassName = "max-h-[85vh]",
  containerClassName = "p-4",
  scrollable = true,
}: BottomSheetProps) {
  const dragControls = useDragControls();
  const sectionRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{
    x: number;
    y: number;
    startedAtMs: number;
    scrollTop: number;
  } | null>(null);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 700) {
      onClose();
    }
  };

  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverscrollY = html.style.overscrollBehaviorY;
    const previousBodyOverscrollY = body.style.overscrollBehaviorY;
    const previousBodyOverflow = body.style.overflow;

    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";
    body.style.overflow = "hidden";

    return () => {
      html.style.overscrollBehaviorY = previousHtmlOverscrollY;
      body.style.overscrollBehaviorY = previousBodyOverscrollY;
      body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

  const handleTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      startedAtMs: performance.now(),
      scrollTop: sectionRef.current?.scrollTop ?? 0,
    };
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const elapsedMs = Math.max(1, performance.now() - start.startedAtMs);
    const velocityY = (deltaY / elapsedMs) * 1000;
    const isMostlyVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.2;
    const canDismissBySwipe = !scrollable || start.scrollTop <= 0;

    if (canDismissBySwipe && isMostlyVertical && (deltaY > 120 || velocityY > 700)) {
      onClose();
    }
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    const touch = event.touches[0];
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const isMostlyVertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.2;
    const currentScrollTop = sectionRef.current?.scrollTop ?? 0;
    const canDismissBySwipe = !scrollable || (start.scrollTop <= 0 && currentScrollTop <= 0);

    if (deltaY > 0 && isMostlyVertical && canDismissBySwipe) {
      event.preventDefault();
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30"
            aria-label="閉じる"
          />
          <motion.section
            ref={sectionRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.35}
            onDragEnd={handleDragEnd}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-[430px] rounded-t-[22px] bg-[#F8F9FA] shadow-xl ${containerClassName} ${maxHeightClassName} ${scrollable ? "overflow-auto" : "overflow-hidden"}`}
            style={{ overscrollBehaviorY: "contain" }}
          >
            <button
              type="button"
              onPointerDown={(event) => dragControls.start(event)}
              className="mx-auto mb-3 flex h-6 w-16 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
              aria-label="シートを移動"
            >
              <span className="h-1.5 w-12 rounded-full bg-[#DADCE0]" />
            </button>
            {(title ?? "") !== "" ? (
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold text-[#202124]">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-1 text-[#5F6368] hover:bg-[#E8EAED]"
                >
                  <X size={18} />
                </button>
              </div>
            ) : null}
            {children}
          </motion.section>
        </>
      ) : null}
    </AnimatePresence>
  );
}
