import { createClient } from "@supabase/supabase-js";
import { config } from "../../config/config";

let _supabase:
  | ReturnType<typeof createClient>
  | null = null;

function getSupabase() {
  if (_supabase) return _supabase;

  const supabaseUrl = config.getSupabaseUrl();
  const supabaseServiceRoleKey = config.getSupabaseServiceRoleKey();

  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
  if (!supabaseServiceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  _supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  return _supabase;
}

export type StorageUploadOptions = {
  contentType?: string;
  upsert?: boolean;
};

export async function uploadObject(
  bucket: string,
  objectPath: string,
  data: ArrayBuffer | Uint8Array | Blob | File,
  options?: StorageUploadOptions,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(bucket).upload(objectPath, data, {
    contentType: options?.contentType,
    upsert: options?.upsert ?? false,
  });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
}

export async function downloadObject(
  bucket: string,
  objectPath: string,
): Promise<ArrayBuffer> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) throw new Error(`Supabase download failed: ${error.message}`);
  if (!data) throw new Error("Supabase download failed: empty response");
  return await data.arrayBuffer();
}

export async function deleteObject(bucket: string, objectPath: string) {
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(bucket).remove([objectPath]);
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}

