// Output port: where the use case announces its domain events. Implemented in infrastructure (an in-process bus
// today; a message broker tomorrow) without the use case changing.
import type { OrderPlaced } from '../../../domain/events/order-placed';

export interface IOrderEvents {
  publish(event: OrderPlaced): Promise<void>;
}
