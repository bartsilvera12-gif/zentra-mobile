import DeviceRouter from "@/shared/device/DeviceRouter";
import DashboardDesktop from "@/desktop/pages/DashboardDesktop";
import DashboardMobile from "@/mobile/pages/DashboardMobile";

/**
 * Home / Dashboard del ERP.
 *
 * Server component thin wrapper que delega al `DeviceRouter`:
 *  - Desktop (>=1024px o UA desktop): renderiza `DashboardDesktop` (la vista original
 *    de 2847 líneas, sin cambios visuales).
 *  - Mobile (<1024px o UA mobile): renderiza `DashboardMobile`, una vista compacta
 *    diseñada desde cero para pantalla angosta.
 *
 * Ambas vistas consumen los mismos datos via `useDashboardData()` de `src/shared/hooks/`.
 */
export default function Page() {
  return (
    <DeviceRouter
      desktop={<DashboardDesktop />}
      mobile={<DashboardMobile />}
    />
  );
}
