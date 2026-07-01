## Setup

No provider/wrapper is required — components read no React context. Just link
`styles.css` once per page; it pulls in the theme tokens, Google Fonts
`@import`, and `_ds_bundle.css`.

Components are Tailwind utility-class based (compiled with Tailwind v4).
Every visual variant is a **typed prop** (`variant`, `size`), never a raw
utility class passed in — pass `className` only to adjust layout (width,
margin, grid placement), not to restyle the component itself.

## Styling idiom: CVA variant props + semantic tokens

Each component's look comes from `class-variance-authority` variant props,
backed by semantic CSS custom properties (`--primary`, `--background`,
`--border`, `--radius`, …) — never raw hex/oklch values.

| Component | Variant prop | Values |
|---|---|---|
| `Button` | `variant` | `default` \| `outline` \| `secondary` \| `ghost` \| `destructive` \| `link` |
| `Button` | `size` | `default` \| `xs` \| `sm` \| `lg` \| `icon` \| `icon-xs` \| `icon-sm` \| `icon-lg` |
| `Badge` | `variant` | `default` \| `secondary` \| `outline` \| `destructive` \| `neutral` \| `info` \| `success` \| `warning` \| `danger` \| `muted` |
| `Card` | `variant` | `default` \| `elevated` \| `interactive` |
| `Card` | `size` | `default` \| `sm` |
| `StatusBadge` | `variant` (required) | `neutral` \| `info` \| `success` \| `warning` \| `danger` \| `muted` |

`StatusBadge` is a thin `Badge` wrapper for semantic status — prefer it over
`Badge` when the content is a domain status (equipment/task/link state),
since its `variant` type is scoped to the status palette (no `default`/
`link`-style options).

`Card` composes with `CardHeader`, `CardTitle`, `CardDescription`,
`CardAction` (top-right of header, e.g. a badge or icon button),
`CardContent`, and `CardFooter` — always as children of `Card`, never
standalone.

## Where the truth lives

Read `_ds_bundle.css` (via `styles.css`) before inventing any class name —
utility classes and the `--*` custom properties are all real Tailwind
output, not hand-authored. Per-component `.prompt.md` files carry the exact
prop shape (mirrors the source `interface <Name>Props`).

## Example

```jsx
const { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent,
  CardFooter, Badge, Button } = window.RlpappUi;

<Card className="w-80">
  <CardHeader>
    <CardTitle>Bomba Centrífuga BC-450</CardTitle>
    <CardDescription>Torre Norte · Instalado em 12/03/2026</CardDescription>
    <CardAction>
      <Badge variant="success">Operacional</Badge>
    </CardAction>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">
      Última manutenção preventiva realizada há 14 dias.
    </p>
  </CardContent>
  <CardFooter className="gap-2">
    <Button size="sm" variant="outline">Ver histórico</Button>
    <Button size="sm">Registrar manutenção</Button>
  </CardFooter>
</Card>
```
