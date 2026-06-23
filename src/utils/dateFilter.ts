type DateFilterParams = {
  date?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
};

export const buildDateFilter = ({
  date,
  startDate,
  endDate,
}: DateFilterParams) => {
  const now = new Date();
  const filter: any = {};

  if (date === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    filter.createdAt = { $gte: start };
  }

  if (date === "week") {
    const start = new Date();
    start.setDate(now.getDate() - 7);

    filter.createdAt = { $gte: start };
  }

  if (date === "month") {
    const start = new Date();
    start.setMonth(now.getMonth() - 1);

    filter.createdAt = { $gte: start };
  }

  if (date === "custom" && startDate && endDate) {
    filter.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  return filter;
};
