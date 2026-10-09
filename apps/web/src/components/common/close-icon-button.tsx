import { X } from "lucide-react";
import { IconButton } from "@/components/common/icon-button";

/** The X that closes a panel or clears a selection. */
export function CloseIconButton({
  onClick,
  label = "Close",
  title,
  size = 15,
}: {
  onClick: () => void;
  label?: string;
  title?: string;
  size?: number;
}) {
  return (
    <IconButton onClick={onClick} aria-label={label} title={title}>
      <X size={size} />
    </IconButton>
  );
}
