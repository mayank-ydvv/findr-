import { createClient } from "@/lib/supabase/server";
import CampusMap from "@/components/map/CampusMap";
import type { PublicReport, Zone } from "@/lib/types";

export default async function HomePage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-neutral-500">
        <p className="max-w-sm text-sm">
          Set <code className="text-neutral-300">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-neutral-300">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to load the
          campus map.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: reports }, { data: zones }] = await Promise.all([
    supabase
      .from("public_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<PublicReport[]>(),
    supabase
      .from("zones")
      .select("id, name, center_lat, center_lng, radius_m")
      .returns<Zone[]>(),
  ]);

  return <CampusMap initialReports={reports ?? []} zones={zones ?? []} />;
}
