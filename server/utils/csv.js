import { stringify } from 'csv-stringify';

export function csvStream(res, headers, rowsAsyncIter) {
  res.setHeader('Content-Type', 'text/csv');
  const stringifier = stringify({ header: true, columns: headers });
  stringifier.pipe(res);
  (async () => {
    for await (const row of rowsAsyncIter) {
      stringifier.write(row);
    }
    stringifier.end();
  })().catch((e) => {
    stringifier.destroy(e);
  });
}

