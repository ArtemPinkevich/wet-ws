import { makeStyles } from 'tss-react/mui';

import { Colors } from '../../assests/styles/variables';

export const useStyles = makeStyles()(() => {
  return {
    input: {
      border: `1px solid ${Colors.white}`,
      background: Colors.grey,
      color: Colors.white,
      textTransform: 'uppercase',
      fontWeight: 670,
    },
  };
});
