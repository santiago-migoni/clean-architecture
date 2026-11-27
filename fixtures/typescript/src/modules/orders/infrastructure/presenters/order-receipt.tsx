// Presenter as a view: turns the use case result into markup. JSX is a delivery detail of infrastructure.
import type { Order } from '../../domain/order';

export function OrderReceipt({ order }: { order: Order }) {
  return (
    <p>
      Order {order.id}: {order.quantity} item(s)
    </p>
  );
}
