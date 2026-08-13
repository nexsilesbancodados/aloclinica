import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold ring-offset-background transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-md shadow-primary/15 hover:bg-primary/90 hover:-translate-y-0.5",
        destructive:
          "bg-destructive text-destructive-foreground shadow-md shadow-destructive/15 hover:bg-destructive/90 hover:-translate-y-0.5",
        outline:
          "border-2 border-input bg-background hover:bg-muted/50 hover:text-foreground hover:border-primary/25 hover:-translate-y-0.5",
        secondary:
          "bg-secondary text-secondary-foreground shadow-md shadow-secondary/15 hover:bg-secondary/90 hover:-translate-y-0.5",
        ghost:
          "hover:bg-muted/50 hover:text-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
        rainbow: "",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-md px-3.5 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const isRainbow = variant === "rainbow";
    const rainbowClasses = cn(
      "btn-rainbow-wrap btn-irish-glint relative z-0 rounded-xl font-black text-white uppercase tracking-wider cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      buttonVariants({ variant: undefined, size, className }),
    );

    if (isRainbow && asChild) {
      const child = React.Children.only(children);

      if (!React.isValidElement(child)) {
        return null;
      }

      const childProps = child.props as {
        className?: string;
        style?: React.CSSProperties;
        children?: React.ReactNode;
      };

      // `React.Children.only` devolve ReactElement<unknown>, então o cloneElement
      // resolve para a sobrecarga genérica e recusa className/style/data-*.
      // O elemento é validado logo acima; estreitamos o tipo para as props que
      // de fato injetamos aqui.
      const typedChild = child as React.ReactElement<Record<string, unknown>>;

      return React.cloneElement(typedChild, {
        ...props,
        className: cn(rainbowClasses, childProps.className),
        style: {
          background: "linear-gradient(0deg, #000, #272727)",
          border: "none",
          ...childProps.style,
        },
        "data-variant": "rainbow",
        children: (
          <>
            <span className="btn-rainbow-border pointer-events-none absolute rounded-xl" aria-hidden="true" />
            <span className="btn-rainbow-glow pointer-events-none absolute rounded-xl" aria-hidden="true" />
            <span className="relative z-30 inline-flex items-center">{childProps.children}</span>
          </>
        ),
      });
    }

    if (isRainbow) {
      return (
        <Comp
          className={rainbowClasses}
          data-variant="rainbow"
          ref={ref}
          style={{
            background: "linear-gradient(0deg, #000, #272727)",
            border: "none",
          }}
          {...props}
        >
          <span className="btn-rainbow-border pointer-events-none absolute rounded-xl" aria-hidden="true" />
          <span className="btn-rainbow-glow pointer-events-none absolute rounded-xl" aria-hidden="true" />
          <span className="relative z-30 inline-flex items-center">{children}</span>
        </Comp>
      );
    }

    return (
      <Comp
        className={cn("btn-irish-glint", buttonVariants({ variant, size, className }))}
        data-variant={variant ?? "default"}
        ref={ref}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
