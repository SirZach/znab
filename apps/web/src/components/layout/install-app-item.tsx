import { Download } from "lucide-react";
import { create } from "zustand";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

type InstallPrompt = Event & { prompt: () => Promise<void> };

// Chrome and Edge fire this once, often before the sidebar mounts, so it is
// caught at load and kept here. Browsers without it (Safari) never show the item.
const useInstallPrompt = create<{ event: InstallPrompt | null }>(() => ({ event: null }));

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  useInstallPrompt.setState({ event: e as InstallPrompt });
});
window.addEventListener("appinstalled", () => useInstallPrompt.setState({ event: null }));

/** "Install app", shown only while the browser offers to install ZNAB. */
export function InstallAppItem() {
  const event = useInstallPrompt((s) => s.event);
  if (!event) return null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="text-sidebar-foreground/70"
        onClick={async () => {
          await event.prompt();
          // A prompt can only be used once, whatever the answer.
          useInstallPrompt.setState({ event: null });
        }}
      >
        <Download />
        <span>Install app</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
