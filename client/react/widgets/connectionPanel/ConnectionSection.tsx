import { Box, TextField } from '@mui/material';

import StyledButton from '../../shared/ui/styledButton/StyledButton';

interface IConnectionPanel {
  title: string;
}

const ConnectionSection = (props: IConnectionPanel) => {
  const { title } = props;

  return (
    <Box>
      {title}
      <Box sx={{ display: 'flex' }}>
        <TextField variant="outlined" />
        <TextField variant="outlined" />
        <StyledButton>connect</StyledButton>
      </Box>
    </Box>
  );
};

export default ConnectionSection;
