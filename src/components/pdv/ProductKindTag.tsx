// Tag da busca de itens: role 1 = serviço, demais = produto.
export function ProductKindTag({ role }: { role?: unknown }) {
  const isService = Number(role) === 1

  return (
    <span
      className={`inline-flex flex-none items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        isService ? 'bg-[var(--indigo-100)] text-[var(--indigo-500)]' : 'bg-[var(--blue-100)] text-[var(--blue-700)]'
      }`}
    >
      {isService ? 'Serviço' : 'Produto'}
    </span>
  )
}
