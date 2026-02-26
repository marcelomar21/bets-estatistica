import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createApiHandler } from '@/middleware/api-handler';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES: Record<string, 'pdf' | 'image'> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'image',
  'image/png': 'image',
};

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
        media_type: mediaType,
        file_name: file.name,
        file_size: file.size,
      },
    });
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
