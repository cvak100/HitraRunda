import { Modal } from "./Modal";

type Props = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title = "Potrditev",
  message,
  confirmLabel = "Potrdi",
  cancelLabel = "Prekliči",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal title={title} open={open} onClose={onCancel}>
      <p>{message}</p>
      <div className="actions">
        <button type="button" className={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Modal>
  );
}
