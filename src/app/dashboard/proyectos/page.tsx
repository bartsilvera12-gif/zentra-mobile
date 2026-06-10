import { resolveDataSchemaForCurrentUserServer } from "@/lib/supabase/empresa-data-server";
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";
import DeviceRouter from "@/shared/device/DeviceRouter";
import ProyectosKanbanClient from "./ProyectosKanbanClient";
import ProyectosMobile from "@/mobile/pages/ProyectosMobile";

/** Módulo Proyectos. DeviceRouter elige desktop (Kanban) vs mobile (vista por etapa). */
export default async function ProyectosPage() {
  let dataSchema = SUPABASE_APP_SCHEMA;
  try {
    dataSchema = await resolveDataSchemaForCurrentUserServer();
  } catch (e) {
    console.error("[dashboard/proyectos] resolveDataSchemaForCurrentUserServer", e);
  }
  return (
    <DeviceRouter
      desktop={<ProyectosKanbanClient dataSchema={dataSchema} />}
      mobile={<ProyectosMobile />}
    />
  );
}
