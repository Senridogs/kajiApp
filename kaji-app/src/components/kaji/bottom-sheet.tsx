"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeightClassName?: string;
};

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeightClassName = "max-h-[85vh]",
}: BottomSheetProps) {
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
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className={`fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-[430px] rounded-t-3xl bg-[#F8F9FA] p-4 shadow-xl ${maxHeightClassName} overflow-auto`}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#DADCE0]" />
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

