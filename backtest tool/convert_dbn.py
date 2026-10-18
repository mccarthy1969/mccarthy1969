"""Optional offline DBN conversion using Databento's official Python package.
Install separately: python -m pip install databento
Usage: python convert_dbn.py input.dbn.zst output.csv
No API key or data download is involved. Output is never overwritten.
"""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
try:
    import databento as db
except ImportError:
    parser.exit(1, 'Optional dependency missing. Install the official databento Python package, or download CSV directly.\n')
if args.destination.exists():
    parser.error('Destination already exists; choose a new file name.')
store = db.DBNStore.from_file(args.source)
if str(store.schema) != 'ohlcv-1s':
    parser.error(f'Expected OHLCV-1s, received {store.schema}.')
store.to_csv(args.destination, pretty_px=True, pretty_ts=True, map_symbols=True, mode='x')
print(f'Created {args.destination}. Import this CSV in SPY Lab.')
