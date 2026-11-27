package bootstrap

import (
	"database/sql"
	"net/http"

	customersinteractors "example.com/shop/internal/modules/customers/application/interactors"
	customersinput "example.com/shop/internal/modules/customers/application/ports/input"
	customersoutput "example.com/shop/internal/modules/customers/application/ports/output"
	customerscontrollers "example.com/shop/internal/modules/customers/infrastructure/controllers"
	customersgateways "example.com/shop/internal/modules/customers/infrastructure/gateways"
	"example.com/shop/internal/platform/db"
)

var customersMigrations = db.Migration{Module: "customers", Files: customersgateways.Migrations}

type customersModule struct {
	GetCustomer      customersinput.GetCustomer // the input port other modules may use
	RegisterCustomer http.Handler
	GetController    http.Handler
}

func composeCustomers(repo customersoutput.CustomerRepository, newID func() string) customersModule {
	getCustomer := customersinteractors.NewGetCustomer(repo)
	return customersModule{
		GetCustomer:      getCustomer,
		RegisterCustomer: customerscontrollers.NewRegisterCustomer(customersinteractors.NewRegisterCustomer(repo, newID)),
		GetController:    customerscontrollers.NewGetCustomer(getCustomer),
	}
}

func sqlCustomers(conn *sql.DB) customersoutput.CustomerRepository {
	return customersgateways.NewSQLCustomerRepository(conn)
}
