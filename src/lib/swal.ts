import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

// Create custom-styled configured Swal instance
export const customSwal = Swal.mixin({
  customClass: {
    popup: "rounded-[1.5rem] border border-slate-200/60 bg-white/95 backdrop-blur-md shadow-2xl p-6 font-sans z-888",
    title: "text-lg font-black text-slate-800 tracking-tight mb-2",
    htmlContainer: "text-xs font-semibold text-slate-500 leading-relaxed mb-4",
    confirmButton: "inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-arin-green to-arin-teal text-white font-black text-[10px] uppercase tracking-widest px-5 py-3 shadow-lg shadow-arin-green/10 hover:opacity-90 active:scale-95 transition-all outline-none border-0 mx-1.5 cursor-pointer font-sans",
    cancelButton: "inline-flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest px-5 py-3 active:scale-95 transition-all outline-none border-0 mx-1.5 cursor-pointer font-sans",
    denyButton: "inline-flex items-center justify-center rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-[10px] uppercase tracking-widest px-5 py-3 shadow-lg shadow-red-500/10 active:scale-95 transition-all outline-none border-0 mx-1.5 cursor-pointer font-sans",
  },
  buttonsStyling: false, // Use our Tailwind styling instead of sweetalert2 defaults
});

export interface ConfirmOptions {
  title: string;
  text: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  icon?: "warning" | "question" | "info" | "error";
}

export const confirmAction = async (options: ConfirmOptions): Promise<boolean> => {
  const result = await customSwal.fire({
    title: options.title,
    text: options.text,
    icon: options.icon || "question",
    showCancelButton: true,
    confirmButtonText: options.confirmButtonText || "Confirm",
    cancelButtonText: options.cancelButtonText || "Cancel",
    reverseButtons: true,
  });
  return result.isConfirmed;
};

export interface AlertOptions {
  title: string;
  text: string;
  icon?: "success" | "error" | "warning" | "info";
  confirmButtonText?: string;
}

export const showAlert = async (options: AlertOptions): Promise<void> => {
  await customSwal.fire({
    title: options.title,
    text: options.text,
    icon: options.icon || "info",
    confirmButtonText: options.confirmButtonText || "OK",
  });
};
