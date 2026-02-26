import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createApiHandler } from '@/middleware/api-handler';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES: Record<string, 'pdf' | 'image'> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'image',
  'image/png': 'image',
};

/** Validate file content via magic bytes (don't trust client-provided MIME type alone) */
function detectMediaType(buffer: Buffer): 'pdf' | 'image' | null {
  if (buffer.length < 4) return null;
  // PDF: starts with %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return 'pdf';
  // JPEG: starts with FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image';
  // PNG: starts with 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image';
  return null;
}

export const POST = createApiHandler(
  async (req, context) => {
    const { groupFilter } = context;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Corpo da requisicao deve ser multipart/form-data' } },
        { status: 400 },
      );
    }

    const file = formData.get('file') as File | null;
    const groupId = (formData.get('group_id') as string) || groupFilter;

    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Arquivo e obrigatorio' } },
        { status: 400 },
      );
    }

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'group_id e obrigatorio' } },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Arquivo excede o limite de 10MB' } },
        { status: 400 },
      );
    }

    // Validate MIME type
    const mediaType = ALLOWED_MIME_TYPES[file.type];
    if (!mediaType) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Tipo de arquivo nao suportado. Apenas PDF, JPG e PNG' } },
        { status: 400 },
      );
    }

    // Group admin cannot upload for other groups
    if (groupFilter && groupId !== groupFilter) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Cannot upload for other groups' } },
        { status: 403 },
      );
    }

    // Generate storage path
    const ext = file.name.split('.').pop()?.toLowerCase() || (mediaType === 'pdf' ? 'pdf' : 'jpg');
    const uuid = crypto.randomUUID();
    const storagePath = `${groupId}/${uuid}.${ext}`;

    // Upload via service_role client (bypasses RLS for write)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate actual file content via magic bytes (file.type is client-controlled)
    const detectedType = detectMediaType(buffer);
    if (!detectedType) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Conteudo do arquivo nao corresponde a PDF, JPG ou PNG' } },
        { status: 400 },
      );
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from('message-media')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { success: false, error: { code: 'STORAGE_ERROR', message: 'Erro ao fazer upload do arquivo' } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        media_storage_path: storagePath,
        media_type: detectedType,
        file_name: file.name,
        file_size: file.size,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);

// DELETE: cleanup orphaned files (best-effort, called if message creation fails after upload)
export const DELETE = createApiHandler(
  async (req, context) => {
    const { groupFilter } = context;

    let body: { media_storage_path?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Corpo invalido' } },
        { status: 400 },
      );
    }

    const path = body.media_storage_path;
    if (!path || typeof path !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'media_storage_path e obrigatorio' } },
        { status: 400 },
      );
    }

    // Validate path belongs to user's group
    if (groupFilter && !path.startsWith(`${groupFilter}/`)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete files from other groups' } },
        { status: 403 },
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    await supabaseAdmin.storage.from('message-media').remove([path]);

    return NextResponse.json({ success: true });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
