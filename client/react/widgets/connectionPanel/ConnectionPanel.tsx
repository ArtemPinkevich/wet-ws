import { Box } from '@mui/material';

import ConnectionSection from './ConnectionSection';

interface IConnectionPanel {
  classes?: string;
}

const ConnectionPanel = (props: IConnectionPanel) => {
  const { classes } = props;

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        border: '1px solid black',
      }}
      className={classes}
    >
      <ConnectionSection title="Listening Interface" />
      <ConnectionSection title="Server Interface" />
    </Box>
  );
};

export default ConnectionPanel;
