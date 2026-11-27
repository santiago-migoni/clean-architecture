package output

import "example.com/shop/internal/modules/orders/domain"

type OrderRepository interface {
	Save(order domain.Order) error
	Count() int
}
