import classNames from 'classnames';

import { Box } from '@mui/material';

import ConnectionSection from './ConnectionSection';
import { useStyles } from './style';

interface IConnectionPanel {
  className?: string;
}

const ConnectionPanel = (props: IConnectionPanel) => {
  const { className } = props;
  const { classes } = useStyles();

  return (
    <Box className={classNames(classes.container, className)}>
      <ConnectionSection title="Listening Interface" />
      <ConnectionSection title="Server Interface" />
    </Box>
  );
};

export default ConnectionPanel;
