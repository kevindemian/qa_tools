import { box } from './box';
import { palette } from './palette';

describe('TUI Visual Snapshots', () => {
    it('renders standard box with content', () => {
        const output = box(['Title', 'Content Line 1', 'Content Line 2'], { border: 'single', padding: 1, width: 60 });
        expect(output).toMatchSnapshot();
    });

    it('renders color-coded status elements', () => {
        const output = palette.green('Success');
        const output2 = palette.red('Error');
        expect(output).toMatchSnapshot();
        expect(output2).toMatchSnapshot();
    });
});
