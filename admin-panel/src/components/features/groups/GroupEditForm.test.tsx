import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupEditForm } from './GroupEditForm';
import type { GroupListItem } from '@/types/database';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const sampleGroup: GroupListItem = {
  id: 'group-uuid-1',
  name: 'Grupo Teste',
  status: 'active',
  telegram_group_id: -1001234567890,
  telegram_admin_group_id: -1009876543210,
  telegram_invite_link: null,
  checkout_url: null,
  posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] },
  created_at: '2026-02-06T12:00:00Z',
};

describe('GroupEditForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with pre-filled data from initialData', () => {
    render(
      <GroupEditForm
        initialData={sampleGroup}
        onSubmit={vi.fn()}
        loading={false}
        error={null}
      />,
    );

    expect(screen.getByLabelText(/Nome do Grupo/i)).toHaveValue('Grupo Teste');
    expect(screen.getByLabelText(/^Telegram Group ID/i)).toHaveValue('-1001234567890');
    expect(screen.getByLabelText(/Telegram Admin Group ID/i)).toHaveValue('-1009876543210');
    expect(screen.getByLabelText(/Status/i)).toHaveValue('active');
  });

  it('validates name is required and minimum 2 chars', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GroupEditForm
        initialData={sampleGroup}
        onSubmit={onSubmit}
        loading={false}
        error={null}
      />,
    );

    const nameInput = screen.getByLabelText(/Nome do Grupo/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'A');
    await user.click(screen.getByRole('button', { name: /Salvar Alteracoes/i }));

    expect(screen.getByText(/pelo menos 2 caracteres/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validates telegram IDs are numeric', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GroupEditForm
        initialData={{ ...sampleGroup, telegram_group_id: null }}
        onSubmit={onSubmit}
        loading={false}
        error={null}
      />,
    );

    await user.type(screen.getByLabelText(/^Telegram Group ID/i), 'not-a-number');
    await user.click(screen.getByRole('button', { name: /Salvar Alteracoes/i }));

    expect(screen.getByText(/deve ser um numero/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows only active, paused, inactive in status select', () => {
    render(
      <GroupEditForm
        initialData={sampleGroup}
        onSubmit={vi.fn()}
        loading={false}
        error={null}
      />,
    );

    const options = screen.getAllByRole('option');
    const optionValues = options.map((o) => (o as HTMLOptionElement).value);

    expect(optionValues).toContain('active');
    expect(optionValues).toContain('paused');
    expect(optionValues).toContain('inactive');
    expect(optionValues).not.toContain('creating');
    expect(optionValues).not.toContain('failed');
  });

  it('calls onSubmit with correct data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GroupEditForm
        initialData={sampleGroup}
        onSubmit={onSubmit}
        loading={false}
        error={null}
      />,
    );

    const nameInput = screen.getByLabelText(/Nome do Grupo/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Grupo Atualizado');

    await user.selectOptions(screen.getByLabelText(/Status/i), 'paused');

    await user.click(screen.getByRole('button', { name: /Salvar Alteracoes/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Grupo Atualizado',
      telegram_group_id: -1001234567890,
      telegram_admin_group_id: -1009876543210,
      status: 'paused',
      additional_invitee_ids: [],
      posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] },
    });
  });

  it('blocks submit when posting times are duplicated', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GroupEditForm
        initialData={sampleGroup}
        onSubmit={onSubmit}
        loading={false}
        error={null}
      />,
    );

    const timeInputs = screen.getAllByDisplayValue(/^\d{2}:\d{2}$/);
    await user.clear(timeInputs[1]);
    await user.type(timeInputs[1], '10:00');
    await user.click(screen.getByRole('button', { name: /Salvar Alteracoes/i }));

    expect(screen.getByText(/Horarios de postagem duplicados/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits updated posting schedule when toggle/time are changed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GroupEditForm
        initialData={sampleGroup}
        onSubmit={onSubmit}
        loading={false}
        error={null}
      />,
    );

    await user.click(screen.getByRole('switch'));

    const timeInput = screen.getByDisplayValue('15:00');
    await user.clear(timeInput);
    await user.type(timeInput, '16:30');

    await user.click(screen.getByRole('button', { name: /Salvar Alteracoes/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      posting_schedule: { enabled: false, times: ['10:00', '16:30', '22:00'] },
    }));
  });

  it('Cancel button navigates back to group details', async () => {
    const user = userEvent.setup();
    render(
      <GroupEditForm
        initialData={sampleGroup}
        onSubmit={vi.fn()}
        loading={false}
        error={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(mockPush).toHaveBeenCalledWith('/groups/group-uuid-1');
  });

  it('displays server error', () => {
    render(
      <GroupEditForm
        initialData={sampleGroup}
        onSubmit={vi.fn()}
        loading={false}
        error="Erro no servidor"
      />,
    );

    expect(screen.getByText('Erro no servidor')).toBeInTheDocument();
  });

  it('shows loading state on submit button', () => {
    render(
      <GroupEditForm
        initialData={sampleGroup}
        onSubmit={vi.fn()}
        loading={true}
        error={null}
      />,
    );

    const button = screen.getByRole('button', { name: /Salvando/i });
    expect(button).toBeDisabled();
  });

  it('renders pre-filled data with null telegram IDs as empty strings', () => {
    render(
      <GroupEditForm
        initialData={{ ...sampleGroup, telegram_group_id: null, telegram_admin_group_id: null }}
        onSubmit={vi.fn()}
        loading={false}
        error={null}
      />,
    );

    expect(screen.getByLabelText(/^Telegram Group ID/i)).toHaveValue('');
    expect(screen.getByLabelText(/Telegram Admin Group ID/i)).toHaveValue('');
  });
});
