import { makeStyles } from 'tss-react/mui';

export const useStyles = makeStyles()(() => ({
  container: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1rem',
  },

  textField: {
    input: {
      fontSize: '1.2rem',
      fontWeight: 600,
      width: '10rem',
    },
  },

  textField_port: {
    input: { width: '7rem' },
  },
}));
