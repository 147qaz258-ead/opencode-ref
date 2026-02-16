import { type ComponentProps, splitProps } from "solid-js"

function Root(props: ComponentProps<"table">) {
  const [local, rest] = splitProps(props, ["class", "classList"])
  return (
    <div class="w-full overflow-auto">
      <table
        data-component="table"
        classList={{
          [local.class ?? ""]: !!local.class,
          ...(local.classList ?? {}),
        }}
        {...rest}
      />
    </div>
  )
}

function Header(props: ComponentProps<"thead">) {
  return <thead {...props} data-slot="header" />
}

function Body(props: ComponentProps<"tbody">) {
  return <tbody {...props} data-slot="body" />
}

function Row(props: ComponentProps<"tr">) {
  return <tr {...props} data-slot="row" />
}

function HeaderCell(props: ComponentProps<"th">) {
  return <th {...props} data-slot="header-cell" />
}

function Cell(props: ComponentProps<"td">) {
  return <td {...props} data-slot="cell" />
}

export const Table = {
  Root,
  Header,
  Body,
  Row,
  HeaderCell,
  Cell,
}
