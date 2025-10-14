import SalesReportController from "./SalesReportController.js";
import StudentsReportController from "./StudentsReportController.js";
import ProductsReportController from "./ProductsReportController.js";
import DiscountsReportController from "./DiscountsReportController.js";
import InstructorsReportController from "./InstructorsReportController.js";

export default {
  Sales: SalesReportController,
  Students: StudentsReportController,
  Products: ProductsReportController,
  Discounts: DiscountsReportController,
  Instructors: InstructorsReportController
};
